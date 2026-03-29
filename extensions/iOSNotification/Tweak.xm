#import <UIKit/UIKit.h>
#import <rootless.h>

@interface NCNotificationRequest : NSObject
@property (nonatomic, retain) NSString *sectionIdentifier;
@property (nonatomic, retain) NSObject *content;
@end

NSURLSession *session;

%hook NCNotificationDispatcher
-(void)postNotificationWithRequest:(NCNotificationRequest*)req {
    @try {
        NSURL *serverUrl = (NSURL *)[NSURL URLWithString:@"https://netsocket.strayfade.com/v1/postNotification"];
        NSDictionary *body = @{
            @"textContent": [req.content valueForKey:@"message"],
            @"title": [req.content valueForKey:@"title"],
            @"bundleIdentifier": req.sectionIdentifier,
        };
        NSLog(@"netsocket Attempting to send notification with bundleIdentifier: %@", req.sectionIdentifier);
        NSData *jsonData = [NSJSONSerialization dataWithJSONObject:body options:0 error:nil];
        
        NSLog(@"netsocket Server URL: %@", serverUrl);
        NSMutableURLRequest *request = [NSMutableURLRequest requestWithURL:serverUrl];
        [request setHTTPMethod:@"POST"];
        [request setValue:@"application/json" forHTTPHeaderField:@"Content-Type"];
        [request setTimeoutInterval:20];
        [request setHTTPBody:jsonData];
        
        NSURLSessionDataTask *task = [session dataTaskWithRequest:request completionHandler:^(NSData *data, NSURLResponse *response, NSError *error) {
            if (error) {
                NSLog(@"netsocket Request failed: %@", error.localizedDescription);
            }
        }];
        
        [task resume];

    } @catch (NSException *e) { 
        NSLog(@"netsocket Exception while posting notification: %@", e);
    }
    %orig;
}
%end

%ctor {
    @try{    
        NSLog(@"netsocket init");
        session = [NSURLSession sharedSession];
        %init;
    }
    @catch(NSException *e) {
        NSLog(@"netsocket Error during init: %@", e);
    }
}


