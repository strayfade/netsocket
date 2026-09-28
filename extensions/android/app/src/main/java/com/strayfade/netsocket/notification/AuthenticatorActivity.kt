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
import androidx.recyclerview.widget.ItemTouchHelper
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import androidx.recyclerview.widget.SimpleItemAnimator
import com.strayfade.netsocket.notification.databinding.ActivityAuthenticatorBinding

class AuthenticatorActivity : AppCompatActivity() {
    private lateinit var binding: ActivityAuthenticatorBinding
    private lateinit var adapter: OtpAccountAdapter
    private val mainHandler = Handler(Looper.getMainLooper())
    private var lastPeriodBucket = -1L
    private var loading = false
    private var reorderPending = false
    private var orderDirty = false
    private var dragging = false
    private var listItemAnimator: RecyclerView.ItemAnimator? = null

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
            refreshAccounts(forceHost = true)
        }
    }

    private val connectionListener = object : HostConnection.Listener {
        override fun onStateChanged(state: HostConnection.State) {
            runOnUiThread {
                renderConnection(state)
                if (state.connected && !loading) {
                    refreshAccounts(forceHost = true)
                }
            }
        }
    }

    private val tickRunnable = object : Runnable {
        override fun run() {
            if (!dragging) {
                val remaining = TotpCodes.millisRemaining()
                val bucket = System.currentTimeMillis() / 1000L / TotpCodes.PERIOD_SECONDS
                adapter.updateTimer(remaining)
                if (bucket != lastPeriodBucket) {
                    lastPeriodBucket = bucket
                    adapter.refreshCodes()
                }
            }
            mainHandler.postDelayed(this, 50L)
        }
    }

    private val itemTouchHelper = ItemTouchHelper(
        object : ItemTouchHelper.SimpleCallback(
            ItemTouchHelper.UP or ItemTouchHelper.DOWN,
            0,
        ) {
            override fun onMove(
                recyclerView: RecyclerView,
                viewHolder: RecyclerView.ViewHolder,
                target: RecyclerView.ViewHolder,
            ): Boolean {
                val from = viewHolder.bindingAdapterPosition
                val to = target.bindingAdapterPosition
                if (from == RecyclerView.NO_POSITION || to == RecyclerView.NO_POSITION) {
                    return false
                }
                return adapter.moveItem(from, to)
            }

            override fun onSwiped(viewHolder: RecyclerView.ViewHolder, direction: Int) = Unit

            override fun isLongPressDragEnabled(): Boolean = true

            override fun onSelectedChanged(viewHolder: RecyclerView.ViewHolder?, actionState: Int) {
                super.onSelectedChanged(viewHolder, actionState)
                if (actionState == ItemTouchHelper.ACTION_STATE_DRAG) {
                    dragging = true
                    listItemAnimator = binding.accountList.itemAnimator
                    binding.accountList.itemAnimator = null
                }
            }

            override fun clearView(recyclerView: RecyclerView, viewHolder: RecyclerView.ViewHolder) {
                super.clearView(recyclerView, viewHolder)
                binding.accountList.itemAnimator = listItemAnimator
                dragging = false
                adapter.updateTimer(TotpCodes.millisRemaining())
                persistOrder()
            }
        }
    )

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityAuthenticatorBinding.inflate(layoutInflater)
        setContentView(binding.root)
        SettingsUi.applyInsets(this, binding.rootContainer)

        adapter = OtpAccountAdapter(
            onClick = { copyCode(it) },
        )
        binding.accountList.layoutManager = LinearLayoutManager(this)
        binding.accountList.adapter = adapter
        (binding.accountList.itemAnimator as? SimpleItemAnimator)?.supportsChangeAnimations = false
        itemTouchHelper.attachToRecyclerView(binding.accountList)

        binding.backButton.setOnClickListener { finish() }
        binding.scanButton.setOnClickListener { openScanner() }
    }

    override fun onStart() {
        super.onStart()
        HostConnection.addListener(connectionListener)
        renderConnection(HostConnection.currentState())
        refreshAccounts(forceHost = HostConnection.currentState().connected)
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

    private fun refreshAccounts(forceHost: Boolean = false) {
        val local = OtpAccountStore.load(this)
        showAccounts(local)

        val connected = HostConnection.currentState().connected
        if (!connected) {
            binding.loadingIndicator.visibility = View.GONE
            return
        }

        if (orderDirty) {
            pushLocalOrderThenSync()
            return
        }

        if (!forceHost && local.isNotEmpty()) {
            // Already showing local cache; still refresh from host in background.
        }

        loading = true
        if (local.isEmpty()) {
            binding.loadingIndicator.visibility = View.VISIBLE
        }
        HostConnection.getOtpAccounts { ok, data, error ->
            loading = false
            binding.loadingIndicator.visibility = View.GONE
            if (!ok) {
                if (adapter.itemCount == 0) {
                    binding.emptyState.visibility = View.VISIBLE
                    binding.emptyState.text = error ?: getString(R.string.authenticator_load_failed)
                }
                return@getOtpAccounts
            }
            val accounts = OtpAccountsParser.fromResponse(data)
            OtpAccountStore.save(this, accounts)
            showAccounts(accounts)
        }
    }

    private fun showAccounts(accounts: List<OtpAccount>) {
        adapter.submitAccounts(accounts)
        binding.emptyState.visibility = if (accounts.isEmpty()) View.VISIBLE else View.GONE
        if (accounts.isEmpty()) {
            binding.emptyState.setText(
                if (HostConnection.currentState().connected) {
                    R.string.authenticator_empty
                } else {
                    R.string.authenticator_offline_empty
                }
            )
        }
        lastPeriodBucket = System.currentTimeMillis() / 1000L / TotpCodes.PERIOD_SECONDS
        adapter.updateTimer(TotpCodes.millisRemaining())
    }

    private fun persistOrder() {
        val accounts = adapter.currentItems()
        OtpAccountStore.save(this, accounts)
        if (accounts.isEmpty()) {
            return
        }
        if (!HostConnection.currentState().connected) {
            orderDirty = true
            return
        }
        if (reorderPending) {
            orderDirty = true
            return
        }
        reorderPending = true
        HostConnection.reorderOtpAccounts(accounts.map { it.key }) { ok, _, error ->
            reorderPending = false
            if (ok) {
                orderDirty = false
            } else {
                orderDirty = true
                Toast.makeText(
                    this,
                    error ?: getString(R.string.authenticator_reorder_failed),
                    Toast.LENGTH_SHORT,
                ).show()
            }
        }
    }

    private fun pushLocalOrderThenSync() {
        val keys = adapter.currentItems().map { it.key }
        if (keys.isEmpty()) {
            orderDirty = false
            refreshAccounts(forceHost = true)
            return
        }
        if (reorderPending) return
        reorderPending = true
        HostConnection.reorderOtpAccounts(keys) { ok, _, _ ->
            reorderPending = false
            if (ok) {
                orderDirty = false
            }
            // Pull latest from host either way once connected.
            loading = true
            HostConnection.getOtpAccounts { fetchOk, data, _ ->
                loading = false
                binding.loadingIndicator.visibility = View.GONE
                if (fetchOk) {
                    val accounts = OtpAccountsParser.fromResponse(data)
                    OtpAccountStore.save(this, accounts)
                    showAccounts(accounts)
                    orderDirty = false
                }
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
        binding.syncStatus.visibility = if (state.connected) View.VISIBLE else View.GONE
    }
}
