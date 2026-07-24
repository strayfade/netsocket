package com.strayfade.netsocket.notification

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.util.Log
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.core.content.ContextCompat
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import com.strayfade.netsocket.notification.databinding.ActivityQrScanBinding
import org.json.JSONArray
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

class QrScanActivity : AppCompatActivity() {
    private lateinit var binding: ActivityQrScanBinding
    private lateinit var cameraExecutor: ExecutorService
    private val processing = AtomicBoolean(false)
    private var importedTotal = 0

    private var migrationBatchId: Int? = null
    private var migrationBatchSize = 1
    private val scannedMigrationIndexes = linkedSetOf<Int>()
    private val scannedPayloads = linkedSetOf<String>()

    private val barcodeScanner = BarcodeScanning.getClient(
        BarcodeScannerOptions.Builder()
            .setBarcodeFormats(Barcode.FORMAT_QR_CODE)
            .build()
    )

    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted) {
            startCamera()
        } else {
            Toast.makeText(this, R.string.authenticator_camera_denied, Toast.LENGTH_LONG).show()
            finish()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityQrScanBinding.inflate(layoutInflater)
        setContentView(binding.root)
        cameraExecutor = Executors.newSingleThreadExecutor()

        binding.backButton.setOnClickListener {
            finishWithResultIfNeeded()
        }
        onBackPressedDispatcher.addCallback(
            this,
            object : OnBackPressedCallback(true) {
                override fun handleOnBackPressed() {
                    finishWithResultIfNeeded()
                }
            }
        )

        when {
            ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) ==
                PackageManager.PERMISSION_GRANTED -> startCamera()
            else -> permissionLauncher.launch(Manifest.permission.CAMERA)
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        cameraExecutor.shutdown()
        barcodeScanner.close()
    }

    private fun startCamera() {
        val cameraProviderFuture = ProcessCameraProvider.getInstance(this)
        cameraProviderFuture.addListener({
            val cameraProvider = cameraProviderFuture.get()
            val preview = Preview.Builder().build().also {
                it.surfaceProvider = binding.previewView.surfaceProvider
            }
            val analysis = ImageAnalysis.Builder()
                .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                .build()
            analysis.setAnalyzer(cameraExecutor) { imageProxy ->
                analyzeFrame(imageProxy)
            }

            try {
                cameraProvider.unbindAll()
                cameraProvider.bindToLifecycle(
                    this,
                    CameraSelector.DEFAULT_BACK_CAMERA,
                    preview,
                    analysis
                )
            } catch (e: Exception) {
                Log.e(TAG, "Camera bind failed", e)
                Toast.makeText(this, R.string.authenticator_camera_failed, Toast.LENGTH_LONG).show()
                finish()
            }
        }, ContextCompat.getMainExecutor(this))
    }

    @Suppress("UnsafeOptInUsageError")
    private fun analyzeFrame(imageProxy: ImageProxy) {
        val mediaImage = imageProxy.image
        if (mediaImage == null || processing.get()) {
            imageProxy.close()
            return
        }
        val image = InputImage.fromMediaImage(mediaImage, imageProxy.imageInfo.rotationDegrees)
        barcodeScanner.process(image)
            .addOnSuccessListener { barcodes ->
                val raw = barcodes
                    .asSequence()
                    .mapNotNull { it.rawValue }
                    .map { it.trim() }
                    .firstOrNull { isSupportedPayload(it) }
                if (raw != null && processing.compareAndSet(false, true)) {
                    runOnUiThread { handlePayload(raw) }
                }
            }
            .addOnCompleteListener {
                imageProxy.close()
            }
    }

    private fun isSupportedPayload(value: String): Boolean {
        val lower = value.lowercase()
        return lower.startsWith("otpauth://") || lower.startsWith("otpauth-migration://")
    }

    private fun handlePayload(payload: String) {
        if (!scannedPayloads.add(payload)) {
            processing.set(false)
            return
        }
        binding.hintText.setText(R.string.authenticator_importing)
        HostConnection.importOtpFromQr(listOf(payload)) { ok, data, error ->
            if (!ok) {
                scannedPayloads.remove(payload)
                Toast.makeText(
                    this,
                    error ?: getString(R.string.authenticator_import_failed),
                    Toast.LENGTH_LONG
                ).show()
                binding.hintText.setText(R.string.authenticator_scan_hint)
                processing.set(false)
                return@importOtpFromQr
            }

            val imported = data?.optInt("imported", 0) ?: 0
            importedTotal += imported

            val batches = data?.optJSONArray("migrationBatches") ?: JSONArray()
            if (batches.length() > 0) {
                val batch = batches.optJSONObject(0)
                val batchId = batch?.optInt("batchId") ?: 0
                val batchSize = batch?.optInt("batchSize", 1) ?: 1
                val batchIndex = batch?.optInt("batchIndex", 0) ?: 0

                if (migrationBatchId == null) {
                    migrationBatchId = batchId
                    migrationBatchSize = batchSize.coerceAtLeast(1)
                }
                if (migrationBatchId == batchId) {
                    scannedMigrationIndexes.add(batchIndex)
                }

                if (scannedMigrationIndexes.size < migrationBatchSize) {
                    binding.hintText.text = getString(
                        R.string.authenticator_scan_migration_progress,
                        scannedMigrationIndexes.size,
                        migrationBatchSize
                    )
                    Toast.makeText(
                        this,
                        getString(
                            R.string.authenticator_scan_next_migration,
                            scannedMigrationIndexes.size,
                            migrationBatchSize
                        ),
                        Toast.LENGTH_SHORT
                    ).show()
                    processing.set(false)
                    return@importOtpFromQr
                }
            }

            setResult(
                RESULT_OK,
                Intent().putExtra(EXTRA_IMPORTED_COUNT, importedTotal)
            )
            finish()
        }
    }

    private fun finishWithResultIfNeeded() {
        if (importedTotal > 0) {
            setResult(
                RESULT_OK,
                Intent().putExtra(EXTRA_IMPORTED_COUNT, importedTotal)
            )
        }
        finish()
    }

    companion object {
        const val EXTRA_IMPORTED_COUNT = "imported_count"
        private const val TAG = "QrScanActivity"
    }
}
