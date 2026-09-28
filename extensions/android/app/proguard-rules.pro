# Keep notification listener entry points for OEM survivability.
-keep class com.strayfade.netsocket.notification.NetsocketNotificationListener { *; }
-keep class com.strayfade.netsocket.notification.KeepAliveService { *; }
-keep class com.strayfade.netsocket.notification.HostConnection { *; }
-keep class com.strayfade.netsocket.notification.BootReceiver { *; }
