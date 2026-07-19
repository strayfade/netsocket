package com.strayfade.netsocket.notification

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageButton
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import io.noties.markwon.Markwon

class MessageAdapter(
    private val markwon: Markwon,
) : ListAdapter<ChatMessage, RecyclerView.ViewHolder>(Diff) {

    override fun getItemViewType(position: Int): Int {
        return when (getItem(position).role) {
            MessageRole.USER -> VIEW_USER
            MessageRole.ASSISTANT -> VIEW_ASSISTANT
            MessageRole.SYSTEM, MessageRole.ERROR -> VIEW_SYSTEM
        }
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): RecyclerView.ViewHolder {
        val inflater = LayoutInflater.from(parent.context)
        return when (viewType) {
            VIEW_USER -> UserHolder(inflater.inflate(R.layout.item_message_user, parent, false))
            VIEW_ASSISTANT -> AssistantHolder(
                inflater.inflate(R.layout.item_message_assistant, parent, false)
            )
            else -> SystemHolder(inflater.inflate(R.layout.item_message_system, parent, false))
        }
    }

    override fun onBindViewHolder(holder: RecyclerView.ViewHolder, position: Int) {
        val item = getItem(position)
        when (holder) {
            is UserHolder -> holder.bind(item)
            is AssistantHolder -> holder.bind(item, markwon)
            is SystemHolder -> holder.bind(item)
        }
    }

    private class UserHolder(view: View) : RecyclerView.ViewHolder(view) {
        private val text: TextView = view.findViewById(R.id.messageText)
        fun bind(message: ChatMessage) {
            text.text = message.text
        }
    }

    private class AssistantHolder(view: View) : RecyclerView.ViewHolder(view) {
        private val text: TextView = view.findViewById(R.id.messageText)
        private val spinner: ProgressBar = view.findViewById(R.id.pendingSpinner)
        private val copyButton: ImageButton = view.findViewById(R.id.copyButton)

        fun bind(message: ChatMessage, markwon: Markwon) {
            if (message.pending) {
                text.visibility = View.GONE
                copyButton.visibility = View.GONE
                spinner.visibility = View.VISIBLE
                copyButton.setOnClickListener(null)
                itemView.setOnLongClickListener(null)
            } else {
                spinner.visibility = View.GONE
                text.visibility = View.VISIBLE
                copyButton.visibility = View.VISIBLE
                markwon.setMarkdown(text, message.text)
                val copy = View.OnClickListener { copyText(itemView.context, message.text) }
                copyButton.setOnClickListener(copy)
                itemView.setOnLongClickListener {
                    copyText(itemView.context, message.text)
                    true
                }
            }
        }

        private fun copyText(context: Context, value: String) {
            val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            clipboard.setPrimaryClip(ClipData.newPlainText("netsocket response", value))
            Toast.makeText(context, R.string.response_copied, Toast.LENGTH_SHORT).show()
        }
    }

    private class SystemHolder(view: View) : RecyclerView.ViewHolder(view) {
        private val text: TextView = view.findViewById(R.id.messageText)
        fun bind(message: ChatMessage) {
            text.text = message.text
            text.setTextColor(
                itemView.context.getColor(
                    if (message.role == MessageRole.ERROR) {
                        android.R.color.holo_red_light
                    } else {
                        R.color.netsocket_on_surface_muted
                    }
                )
            )
        }
    }

    private object Diff : DiffUtil.ItemCallback<ChatMessage>() {
        override fun areItemsTheSame(oldItem: ChatMessage, newItem: ChatMessage): Boolean {
            return oldItem.id == newItem.id
        }

        override fun areContentsTheSame(oldItem: ChatMessage, newItem: ChatMessage): Boolean {
            return oldItem == newItem
        }
    }

    companion object {
        private const val VIEW_USER = 1
        private const val VIEW_ASSISTANT = 2
        private const val VIEW_SYSTEM = 3
    }
}
