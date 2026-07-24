package com.strayfade.netsocket.notification

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.recyclerview.widget.RecyclerView
import com.strayfade.netsocket.notification.databinding.ItemOtpAccountBinding

class OtpAccountAdapter(
    private val onClick: (OtpAccount) -> Unit,
) : RecyclerView.Adapter<OtpAccountAdapter.Holder>() {

    private val items = mutableListOf<OtpAccount>()
    private var millisRemaining: Int = TotpCodes.PERIOD_MILLIS
    private var recyclerView: RecyclerView? = null

    fun currentItems(): List<OtpAccount> = items.toList()

    fun submitAccounts(accounts: List<OtpAccount>) {
        items.clear()
        items.addAll(accounts)
        notifyDataSetChanged()
    }

    fun moveItem(from: Int, to: Int): Boolean {
        if (from == to || from !in items.indices || to !in items.indices) {
            return false
        }
        val item = items.removeAt(from)
        items.add(to, item)
        notifyItemMoved(from, to)
        return true
    }

    /** Update visible progress rings without RecyclerView change notifications. */
    fun updateTimer(millis: Int) {
        millisRemaining = millis
        val list = recyclerView ?: return
        for (i in 0 until list.childCount) {
            val child = list.getChildAt(i) ?: continue
            (list.getChildViewHolder(child) as? Holder)?.bindTimer(millis)
        }
    }

    fun refreshCodes() {
        val list = recyclerView ?: return
        for (i in 0 until list.childCount) {
            val child = list.getChildAt(i) ?: continue
            val holder = list.getChildViewHolder(child) as? Holder ?: continue
            val position = holder.bindingAdapterPosition
            if (position != RecyclerView.NO_POSITION && position in items.indices) {
                holder.bindCode(items[position])
            }
        }
    }

    override fun onAttachedToRecyclerView(recyclerView: RecyclerView) {
        super.onAttachedToRecyclerView(recyclerView)
        this.recyclerView = recyclerView
    }

    override fun onDetachedFromRecyclerView(recyclerView: RecyclerView) {
        super.onDetachedFromRecyclerView(recyclerView)
        if (this.recyclerView === recyclerView) {
            this.recyclerView = null
        }
    }

    override fun getItemCount(): Int = items.size

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): Holder {
        val binding = ItemOtpAccountBinding.inflate(
            LayoutInflater.from(parent.context),
            parent,
            false
        )
        return Holder(binding)
    }

    override fun onBindViewHolder(holder: Holder, position: Int) {
        holder.bind(items[position], millisRemaining)
    }

    inner class Holder(
        private val binding: ItemOtpAccountBinding,
    ) : RecyclerView.ViewHolder(binding.root) {
        fun bind(account: OtpAccount, millis: Int) {
            val issuer = account.issuer.ifBlank { account.key }
            val label = account.account
            binding.issuerName.text = issuer
            binding.accountName.text = label
            binding.accountName.visibility = if (label.isBlank()) {
                View.GONE
            } else {
                View.VISIBLE
            }
            bindCode(account)
            bindTimer(millis)
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

        fun bindTimer(millis: Int) {
            binding.timerProgress.max = TotpCodes.PERIOD_MILLIS
            binding.timerProgress.setProgressCompat(
                millis.coerceIn(0, TotpCodes.PERIOD_MILLIS),
                false,
            )
        }
    }
}
