package com.strayfade.netsocket.notification

import android.annotation.SuppressLint
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import com.strayfade.netsocket.notification.databinding.ActivityBrowserBinding

/**
 * In-app browser for the netsocket web app. Uses the app's own WebView profile so
 * login sessions persist across launches, separate from the system browser.
 */
class BrowserActivity : AppCompatActivity() {
    private lateinit var binding: ActivityBrowserBinding

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityBrowserBinding.inflate(layoutInflater)
        setContentView(binding.root)
        SettingsUi.applyInsets(this, binding.rootContainer)

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
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView, newProgress: Int) {
                binding.progressBar.progress = newProgress
                binding.progressBar.visibility = if (newProgress >= 100) View.GONE else View.VISIBLE
            }

            override fun onReceivedTitle(view: WebView, title: String?) {
                binding.titleText.text = title?.takeIf { it.isNotBlank() }
                    ?: getString(R.string.features_website)
            }
        }

        webView.loadUrl(Prefs(this).siteUrl())

        binding.backButton.setOnClickListener { goBackOrFinish() }
        onBackPressedDispatcher.addCallback(
            this,
            object : OnBackPressedCallback(true) {
                override fun handleOnBackPressed() = goBackOrFinish()
            }
        )
    }

    private fun goBackOrFinish() {
        if (binding.webView.canGoBack()) {
            binding.webView.goBack()
        } else {
            finish()
        }
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
}
