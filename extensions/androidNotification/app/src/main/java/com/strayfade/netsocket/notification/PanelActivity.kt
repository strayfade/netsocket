package com.strayfade.netsocket.notification

import android.annotation.SuppressLint
import android.app.AlertDialog
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.os.SystemClock
import android.view.GestureDetector
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import com.strayfade.netsocket.notification.databinding.ActivityPanelBinding
import org.json.JSONObject

/**
 * Wall-panel surface for an assigned netsocket panel.
 *
 * Authentication is the dashboard login session (shared WebView cookie jar —
 * sign in once via Features → Open netsocket) plus the standard host device
 * pairing (approve/deny) for grant discovery. Once approved, the app asks
 * the host which panels this device is granted and loads the shared kiosk
 * page (`/panel/:id`) in a WebView, exactly like a browser kiosk.
 */
class PanelActivity : AppCompatActivity() {
    private lateinit var binding: ActivityPanelBinding
    private var loading = false
    private var loadedPanelId: String? = null
    private var needsPanelReload = false
    private var grantsCache: List<PanelGrant> = emptyList()
    private var tapCount = 0
    private var lastTapUp = 0L

    // Hidden affordance: triple-tap anywhere re-opens the panel picker.
    // There is no visible chrome on this kiosk surface by design.
    // Lazy: GestureDetector needs an attached base context.
    private val tapDetector by lazy {
        GestureDetector(this,
            object : GestureDetector.SimpleOnGestureListener() {
                override fun onSingleTapConfirmed(e: MotionEvent): Boolean {
                    val now = SystemClock.uptimeMillis()
                    tapCount = if (now - lastTapUp < 600) tapCount + 1 else 1
                    lastTapUp = now
                    if (tapCount >= 3) {
                        tapCount = 0
                        showPickerIfMultiple(force = true)
                    }
                    return false
                }
            })
    }

    override fun dispatchTouchEvent(ev: MotionEvent): Boolean {
        tapDetector.onTouchEvent(ev)
        return super.dispatchTouchEvent(ev)
    }

    data class PanelGrant(val id: String, val name: String, val room: String) {
        fun displayName(): String = if (room.isNotBlank()) "$name ($room)" else name
    }

    private val connectionListener = object : HostConnection.Listener {
        override fun onStateChanged(state: HostConnection.State) {
            runOnUiThread {
                if (state.authStatus == "denied") {
                    unloadPanel()
                }
                renderConnection(state)
                if (state.connected && !loading) {
                    loadPanel()
                }
            }
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityPanelBinding.inflate(layoutInflater)
        setContentView(binding.root)
        SettingsUi.applyInsets(this, binding.rootContainer)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        hideSystemBars()

        val webView = binding.webView
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            useWideViewPort = true
            loadWithOverviewMode = true
            builtInZoomControls = true
            displayZoomControls = false
        }

        CookieManager.getInstance().apply {
            setAcceptCookie(true)
            setAcceptThirdPartyCookies(webView, true)
        }

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, url: String): Boolean {
                val scheme = Uri.parse(url).scheme?.lowercase()
                if (scheme != "http" && scheme != "https") {
                    return true
                }
                return false
            }

            override fun onPageFinished(view: WebView, url: String) {
                super.onPageFinished(view, url)
                if (!needsPanelReload) return
                val path = Uri.parse(url).path.orEmpty()
                if (path == "/dashboard" || path == "/") {
                    val panelId = loadedPanelId ?: return
                    needsPanelReload = false
                    val base = Prefs(this@PanelActivity).siteUrl().trimEnd('/')
                    view.loadUrl("$base/panel/$panelId")
                } else if (path.startsWith("/panel/")) {
                    needsPanelReload = false
                }
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView, newProgress: Int) {
                binding.progressBar.progress = newProgress
                binding.progressBar.visibility = if (newProgress >= 100) View.GONE else View.VISIBLE
            }
        }

        onBackPressedDispatcher.addCallback(
            this,
            object : OnBackPressedCallback(true) {
                override fun handleOnBackPressed() = goBackOrFinish()
            }
        )
    }

    private fun hideSystemBars() {
        WindowCompat.setDecorFitsSystemWindows(window, false)
        window.statusBarColor = Color.TRANSPARENT
        window.navigationBarColor = Color.TRANSPARENT
        WindowInsetsControllerCompat(window, window.decorView).apply {
            hide(WindowInsetsCompat.Type.systemBars())
            systemBarsBehavior =
                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }
    }

    override fun onResume() {
        super.onResume()
        hideSystemBars()
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) hideSystemBars()
    }

    override fun onStart() {
        super.onStart()
        HostConnection.addListener(connectionListener)
        renderConnection(HostConnection.currentState())
        loadPanel()
    }

    override fun onStop() {
        super.onStop()
        HostConnection.removeListener(connectionListener)
    }

    override fun onDestroy() {
        binding.webView.apply {
            (parent as? ViewGroup)?.removeView(this)
            stopLoading()
            webChromeClient = null
            destroy()
        }
        super.onDestroy()
    }

    private fun goBackOrFinish() {
        if (binding.webView.canGoBack()) {
            binding.webView.goBack()
        } else {
            finish()
        }
    }

    private fun renderConnection(state: HostConnection.State) {
        if (loadedPanelId != null && state.connected) {
            binding.statusText.visibility = View.GONE
            return
        }
        binding.statusText.visibility = View.VISIBLE
        binding.statusText.text = when {
            state.authStatus == "denied" -> getString(R.string.panel_status_denied)
            state.authStatus == "pending" -> getString(R.string.panel_status_pending)
            state.connecting -> getString(R.string.status_connecting)
            !state.connected -> state.lastError.takeIf { it.isNotBlank() }
                ?: getString(R.string.panel_status_disconnected)
            else -> getString(R.string.panel_status_loading)
        }
    }

    private fun unloadPanel() {
        loadedPanelId = null
        needsPanelReload = false
        grantsCache = emptyList()
        binding.webView.loadUrl("about:blank")
    }

    private fun loadPanel() {
        val state = HostConnection.currentState()
        if (!state.connected || loading) {
            renderConnection(state)
            return
        }
        loading = true
        renderConnection(state)
        HostConnection.getPanelGrants { ok, data, _ ->
            if (!ok) {
                loading = false
                showStatus(R.string.panel_status_setup_failed)
                return@getPanelGrants
            }
            grantsCache = parseGrants(data)
            if (grantsCache.isEmpty()) {
                loading = false
                Prefs(this).selectedPanelId = ""
                showStatus(R.string.panel_status_unassigned)
                return@getPanelGrants
            }
            val saved = Prefs(this).selectedPanelId
            val match = grantsCache.firstOrNull { it.id == saved }
            when {
                match != null -> openPanel(match)
                grantsCache.size == 1 -> openPanel(grantsCache.first())
                else -> {
                    loading = false
                    showPicker()
                }
            }
        }
    }

    private fun parseGrants(data: JSONObject?): List<PanelGrant> {
        val panels = data?.optJSONArray("panels") ?: return emptyList()
        val out = mutableListOf<PanelGrant>()
        for (i in 0 until panels.length()) {
            val entry = panels.optJSONObject(i) ?: continue
            val id = entry.optString("id").trim()
            if (id.isEmpty()) continue
            out.add(
                PanelGrant(
                    id = id,
                    name = entry.optString("name").trim().ifEmpty { id },
                    room = entry.optString("room").trim(),
                )
            )
        }
        return out
    }

    private fun showPicker() {
        showPickerIfMultiple(force = true)
    }

    private fun showPickerIfMultiple(force: Boolean = false) {
        if (grantsCache.size < 2) return
        if (!force && loadedPanelId != null) return
        val names = grantsCache.map { it.displayName() }.toTypedArray()
        val checked = grantsCache.indexOfFirst { it.id == Prefs(this).selectedPanelId }
        AlertDialog.Builder(this)
            .setTitle(R.string.panel_pick_title)
            .setSingleChoiceItems(names, checked) { dialog, which ->
                dialog.dismiss()
                openPanel(grantsCache[which])
            }
            .setNegativeButton(android.R.string.cancel, null)
            .show()
    }

    private fun showStatus(messageRes: Int) {
        binding.statusText.visibility = View.VISIBLE
        binding.statusText.setText(messageRes)
    }

    private fun openPanel(grant: PanelGrant) {
        if (grant.id == loadedPanelId) {
            loading = false
            renderConnection(HostConnection.currentState())
            return
        }
        Prefs(this).selectedPanelId = grant.id
        // Session cookie (shared WebView profile — sign in via Open netsocket)
        // authenticates the kiosk page. After an in-WebView login the host
        // lands on /dashboard, so bounce back to the panel once.
        needsPanelReload = true
        loadedPanelId = grant.id
        loading = false
        val base = Prefs(this).siteUrl().trimEnd('/')
        binding.webView.loadUrl("$base/panel/${grant.id}")
        binding.statusText.visibility = View.GONE
    }
}
