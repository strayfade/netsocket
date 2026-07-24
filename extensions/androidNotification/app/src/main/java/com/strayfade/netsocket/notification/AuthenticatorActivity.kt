package com.strayfade.netsocket.notification

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.recyclerview.widget.LinearLayoutManager
import com.strayfade.netsocket.notification.databinding.ActivityAuthenticatorBinding

class AuthenticatorActivity : AppCompatActivity() {
    private lateinit var binding: ActivityAuthenticatorBinding
    private lateinit var adapter: OtpAccountAdapter
    private val mainHandler = Handler(Looper.getMainLooper())
    private var lastPeriodBucket = -1L
    private var loading = false

    private val scanLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode == RESULT_OK) {
            val imported = result.data?.getIntExtra(QrScanActivity.EXTRA_IMPORTED_COUNT, 0) ?: 0
            val message = if (imported > 0) {
                getString(R.string.authenticator_import_success, imported)
            } else {
                getString(R.string.authenticator_import_done)
            }
            Toast.makeText(this, message, Toast.LENGTH_SHORT).show()
            refreshAccounts()
        }
    }

    private val connectionListener = object : HostConnection.Listener {
        override fun onStateChanged(state: HostConnection.State) {
            runOnUiThread {
                renderConnection(state)
                if (state.connected && adapter.currentList.isEmpty() && !loading) {
                    refreshAccounts()
                }
            }
        }
    }

    private val tickRunnable = object : Runnable {
        override fun run() {
            val remaining = TotpCodes.secondsRemaining()
            val bucket = System.currentTimeMillis() / 1000L / TotpCodes.PERIOD_SECONDS
            adapter.updateTimer(remaining)
            if (bucket != lastPeriodBucket) {
                lastPeriodBucket = bucket
                adapter.refreshCodes()
            }
            mainHandler.postDelayed(this, 250L)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityAuthenticatorBinding.inflate(layoutInflater)
        setContentView(binding.root)
        SettingsUi.applyInsets(this, binding.rootContainer)

        adapter = OtpAccountAdapter(
            onCopy = { copyCode(it) },
            onClick = { copyCode(it) },
        )
        binding.accountList.layoutManager = LinearLayoutManager(this)
        binding.accountList.adapter = adapter

        binding.backButton.setOnClickListener { finish() }
        binding.scanButton.setOnClickListener { openScanner() }
        binding.scanFab.setOnClickListener { openScanner() }
    }

    override fun onStart() {
        super.onStart()
        HostConnection.addListener(connectionListener)
        renderConnection(HostConnection.currentState())
        refreshAccounts()
        mainHandler.post(tickRunnable)
    }

    override fun onStop() {
        super.onStop()
        HostConnection.removeListener(connectionListener)
        mainHandler.removeCallbacks(tickRunnable)
    }

    private fun openScanner() {
        if (!HostConnection.currentState().connected) {
            Toast.makeText(this, R.string.authenticator_not_connected, Toast.LENGTH_SHORT).show()
            return
        }
        scanLauncher.launch(Intent(this, QrScanActivity::class.java))
    }

    private fun refreshAccounts() {
        if (!HostConnection.currentState().connected) {
            binding.emptyState.visibility = View.VISIBLE
            binding.emptyState.setText(R.string.authenticator_not_connected)
            binding.loadingIndicator.visibility = View.GONE
            return
        }
        loading = true
        binding.loadingIndicator.visibility = View.VISIBLE
        HostConnection.getOtpAccounts { ok, data, error ->
            loading = false
            binding.loadingIndicator.visibility = View.GONE
            if (!ok) {
                binding.emptyState.visibility = View.VISIBLE
                binding.emptyState.text = error ?: getString(R.string.authenticator_load_failed)
                return@getOtpAccounts
            }
            val accounts = OtpAccountsParser.fromResponse(data)
            adapter.submitList(accounts) {
                binding.emptyState.visibility = if (accounts.isEmpty()) View.VISIBLE else View.GONE
                if (accounts.isEmpty()) {
                    binding.emptyState.setText(R.string.authenticator_empty)
                }
                lastPeriodBucket = System.currentTimeMillis() / 1000L / TotpCodes.PERIOD_SECONDS
                adapter.updateTimer(TotpCodes.secondsRemaining())
            }
        }
    }

    private fun copyCode(account: OtpAccount) {
        val code = account.currentCode().replace(" ", "")
        val clipboard = getSystemService(CLIPBOARD_SERVICE) as ClipboardManager
        clipboard.setPrimaryClip(ClipData.newPlainText("OTP", code))
        Toast.makeText(this, R.string.response_copied, Toast.LENGTH_SHORT).show()
    }

    private fun renderConnection(state: HostConnection.State) {
        binding.statusText.text = when {
            state.connected -> getString(R.string.authenticator_status_connected)
            state.authStatus == "pending" -> getString(R.string.status_pending)
            state.authStatus == "denied" -> getString(R.string.status_denied)
            state.connecting -> getString(R.string.status_connecting)
            state.lastError.isNotBlank() -> state.lastError
            else -> getString(R.string.status_disconnected)
        }
    }
}
