#import <UIKit/UIKit.h>
#import <rootless.h>

@interface NCNotificationRequest : NSObject
@property (nonatomic, retain) NSString *sectionIdentifier;
@property (nonatomic, retain) NSObject *content;
@end

NSURLSession *session;
static NSString *const kNetsocketLogPath = @"/var/mobile/Library/Preferences/com.strayfade.netsocket.log";

static void netsocketAppendLogLine(NSString *line) {
    if (!line) {
        return;
    }

    NSDateFormatter *formatter = [[NSDateFormatter alloc] init];
    formatter.dateFormat = @"yyyy-MM-dd HH:mm:ss.SSS";
    NSString *timestamp = [formatter stringFromDate:[NSDate date]];
    NSString *entry = [NSString stringWithFormat:@"[%@] %@\n", timestamp, line];
    NSData *data = [entry dataUsingEncoding:NSUTF8StringEncoding];
    NSFileManager *fileManager = [NSFileManager defaultManager];

    if (![fileManager fileExistsAtPath:kNetsocketLogPath]) {
        [data writeToFile:kNetsocketLogPath atomically:YES];
        return;
    }

    NSFileHandle *handle = [NSFileHandle fileHandleForWritingAtPath:kNetsocketLogPath];
    if (!handle) {
        [data writeToFile:kNetsocketLogPath atomically:YES];
        return;
    }

    @try {
        [handle seekToEndOfFile];
        [handle writeData:data];
        [handle closeFile];
    } @catch (NSException *exception) {
        NSLog(@"netsocket Failed writing debug log: %@", exception);
        [handle closeFile];
    }
}

static void netsocketLog(NSString *format, ...) {
    va_list args;
    va_start(args, format);
    NSString *message = [[NSString alloc] initWithFormat:format arguments:args];
    va_end(args);

    NSLog(@"netsocket %@", message);
    netsocketAppendLogLine(message);
}

static NSString *netsocketReadStringPreference(CFStringRef key, NSString *fallback) {
    CFPropertyListRef value = CFPreferencesCopyAppValue(key, CFSTR("com.strayfade.netsocket~prefs"));
    if (!value) {
        netsocketLog(@"Preference %@ missing, using fallback.", (__bridge NSString *)key);
        return fallback;
    }

    NSString *stringValue = nil;
    if (CFGetTypeID(value) == CFStringGetTypeID()) {
        stringValue = [(__bridge NSString *)value stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]];
    }
    CFRelease(value);

    if (!stringValue || stringValue.length == 0) {
        netsocketLog(@"Preference %@ empty, using fallback.", (__bridge NSString *)key);
        return fallback;
    }
    netsocketLog(@"Preference %@ loaded: %@", (__bridge NSString *)key, stringValue);
    return stringValue;
}

static BOOL netsocketReadBoolPreference(CFStringRef key, BOOL fallback) {
    CFPropertyListRef value = CFPreferencesCopyAppValue(key, CFSTR("com.strayfade.netsocket~prefs"));
    if (!value) {
        netsocketLog(@"Preference %@ missing, using bool fallback: %@", (__bridge NSString *)key, fallback ? @"true" : @"false");
        return fallback;
    }

    BOOL boolValue = fallback;
    if (CFGetTypeID(value) == CFBooleanGetTypeID()) {
        boolValue = CFBooleanGetValue((CFBooleanRef)value);
    } else if (CFGetTypeID(value) == CFNumberGetTypeID()) {
        int numberValue = 0;
        if (CFNumberGetValue((CFNumberRef)value, kCFNumberIntType, &numberValue)) {
            boolValue = numberValue != 0;
        }
    }

    CFRelease(value);
    netsocketLog(@"Preference %@ loaded bool: %@", (__bridge NSString *)key, boolValue ? @"true" : @"false");
    return boolValue;
}

static NSString *netsocketConfiguredServerURL() {
    NSString *defaultURL = @"https://netsocket.strayfade.com/v1/postNotification";
    NSString *defaultDevelopmentURL = @"https://netsocket-dev.strayfade.com/v1/postNotification";
    BOOL developmentMode = netsocketReadBoolPreference(CFSTR("DevelopmentMode"), NO);
    if (developmentMode) {
        netsocketLog(@"Development mode enabled.");
        return netsocketReadStringPreference(CFSTR("DevelopmentServerURL"), defaultDevelopmentURL);
    }
    netsocketLog(@"Development mode disabled.");
    return netsocketReadStringPreference(CFSTR("ServerURL"), defaultURL);
}

static NSURL *netsocketURLByAppendingPassword(NSURL *baseURL, NSString *password) {
    if (!baseURL || !password || password.length == 0) {
        return baseURL;
    }

    NSURLComponents *components = [NSURLComponents componentsWithURL:baseURL resolvingAgainstBaseURL:NO];
    if (!components) {
        return baseURL;
    }

    NSString *path = components.path ?: @"";
    if (path.length == 0) {
        path = @"/";
    }
    if (![path hasSuffix:@"/"]) {
        path = [path stringByAppendingString:@"/"];
    }

    components.path = [path stringByAppendingString:password];
    return components.URL ?: baseURL;
}

%hook NCNotificationDispatcher
-(void)postNotificationWithRequest:(NCNotificationRequest*)req {
    @try {
        NSURL *serverUrl = [NSURL URLWithString:netsocketConfiguredServerURL()];
        if (!serverUrl) {
            netsocketLog(@"Invalid configured URL. Falling back to production default endpoint.");
            serverUrl = [NSURL URLWithString:@"https://netsocket.strayfade.com/v1/postNotification"];
        }
        NSString *message = [req.content valueForKey:@"message"] ?: @"";
        NSString *title = [req.content valueForKey:@"title"] ?: @"";
        NSString *bundleIdentifier = req.sectionIdentifier ?: @"unknown.bundle";
        NSDictionary *body = @{
            @"textContent": message,
            @"title": title,
            @"bundleIdentifier": bundleIdentifier,
        };
        NSString *password = netsocketReadStringPreference(CFSTR("Password"), @"");
        serverUrl = netsocketURLByAppendingPassword(serverUrl, password);
        if (password.length > 0) {
            netsocketLog(@"Password path suffix enabled.");
        }
        netsocketLog(@"Preparing POST to %@ for bundle %@", serverUrl.absoluteString, bundleIdentifier);
        NSData *jsonData = [NSJSONSerialization dataWithJSONObject:body options:0 error:nil];
        
        NSMutableURLRequest *request = [NSMutableURLRequest requestWithURL:serverUrl];
        [request setHTTPMethod:@"POST"];
        [request setValue:@"application/json" forHTTPHeaderField:@"Content-Type"];
        [request setTimeoutInterval:20];
        [request setHTTPBody:jsonData];
        
        NSURLSessionDataTask *task = [session dataTaskWithRequest:request completionHandler:^(NSData *data, NSURLResponse *response, NSError *error) {
            if (error) {
                netsocketLog(@"Request failed: %@ (%@)", error.localizedDescription, error.domain);
                return;
            }

            NSHTTPURLResponse *httpResponse = (NSHTTPURLResponse *)response;
            NSString *responseBody = data.length > 0 ? [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding] : @"";
            if (!responseBody) {
                responseBody = @"<non-utf8 response>";
            }
            netsocketLog(@"Response status: %ld body: %@", (long)httpResponse.statusCode, responseBody);
            if (httpResponse.statusCode < 200 || httpResponse.statusCode >= 300) {
                netsocketLog(@"Non-success HTTP status received.");
            }
        }];
        
        [task resume];
        netsocketLog(@"Request sent.");

    } @catch (NSException *e) { 
        netsocketLog(@"Exception while posting notification: %@", e);
    }
    %orig;
}
%end

%ctor {
    @try{    
        netsocketLog(@"init");
        session = [NSURLSession sharedSession];
        %init;
    }
    @catch(NSException *e) {
        netsocketLog(@"Error during init: %@", e);
    }
}


