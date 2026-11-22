import UIKit
import Capacitor
import FirebaseCore
import FirebaseMessaging

struct PushSetupError: LocalizedError {
    var errorDescription: String? { "Firebase is not configured for this build" }
}

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Firebase values come from Pebble.xcconfig through Info.plist, so no GoogleService-Info.plist per bundle ID.
        let info = Bundle.main.infoDictionary ?? [:]
        if let appID = info["PebbleFirebaseAppID"] as? String, !appID.isEmpty,
           let sender = info["PebbleFirebaseSenderID"] as? String {
            let options = FirebaseOptions(googleAppID: appID, gcmSenderID: sender)
            options.apiKey = info["PebbleFirebaseAPIKey"] as? String
            options.projectID = info["PebbleFirebaseProjectID"] as? String
            options.bundleID = Bundle.main.bundleIdentifier ?? ""
            FirebaseApp.configure(options: options)
        }
        return true
    }

    // The server sends through FCM, so Capacitor gets the FCM token instead of the raw APNs token.
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        guard FirebaseApp.app() != nil else {
            NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: PushSetupError())
            return
        }
        Messaging.messaging().apnsToken = deviceToken
        Messaging.messaging().token { token, error in
            if let token {
                NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: token)
            } else {
                NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error ?? PushSetupError())
            }
        }
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }

    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default Configuration",
                                          sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }
}
