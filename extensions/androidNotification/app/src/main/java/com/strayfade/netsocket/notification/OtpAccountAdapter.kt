package com.strayfade.netsocket.notification

import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import com.strayfade.netsocket.notification.databinding.ItemOtpAccountBinding

class OtpAccountAdapter(
    private val onCopy: (OtpAccount) -> Unit,
    private val onClick: (OtpAccount) -> Unit,
) : ListAdapter<OtpAccount, OtpAccountAdapter.Holder>(Diff) {

    private var secondsRemaining: Int = TotpCodes.PERIOD_SECONDS

    object Diff : DiffUtil.ItemCallback<OtpAccount>() {
        override fun areItemsTheSame(oldItem: OtpAccount, newItem: OtpAccount): Boolean {
            return oldItem.key == newItem.key
        }

        override fun areContentsTheSame(oldItem: OtpAccount, newItem: OtpAccount): Boolean {
            return oldItem == newItem
        }
    }

    fun updateTimer(seconds: Int) {
        secondsRemaining = seconds
        notifyItemRangeChanged(0, itemCount, PAYLOAD_TIMER)
    }

    fun refreshCodes() {
        notifyItemRangeChanged(0, itemCount, PAYLOAD_CODE)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): Holder {
        val binding = ItemOtpAccountBinding.inflate(
            LayoutInflater.from(parent.context),
            parent,
            false
        )
        return Holder(binding)
    }

    override fun onBindViewHolder(holder: Holder, position: Int) {
        holder.bind(getItem(position), secondsRemaining)
    }

    override fun onBindViewHolder(holder: Holder, position: Int, payloads: MutableList<Any>) {
        if (payloads.isEmpty()) {
            onBindViewHolder(holder, position)
            return
        }
        val account = getItem(position)
        payloads.forEach { payload ->
            when (payload) {
                PAYLOAD_TIMER -> holder.bindTimer(secondsRemaining)
                PAYLOAD_CODE -> holder.bindCode(account)
            }
        }
    }

    inner class Holder(
        private val binding: ItemOtpAccountBinding,
    ) : RecyclerView.ViewHolder(binding.root) {
        fun bind(account: OtpAccount, seconds: Int) {
            binding.accountName.text = account.displayName
            bindCode(account)
            bindTimer(seconds)
            binding.copyButton.setOnClickListener { onCopy(account) }
            binding.root.setOnClickListener { onClick(account) }
        }

        fun bindCode(account: OtpAccount) {
            val code = account.currentCode()
            binding.otpCode.text = if (code.length == 6) {
                "${code.substring(0, 3)} ${code.substring(3)}"
            } else {
                code
            }
        }

        fun bindTimer(seconds: Int) {
            binding.timerProgress.max = TotpCodes.PERIOD_SECONDS
            binding.timerProgress.progress = seconds
            binding.timerText.text = seconds.toString()
        }
    }

    companion object {
        private const val PAYLOAD_TIMER = "timer"
        private const val PAYLOAD_CODE = "code"
    }
}
