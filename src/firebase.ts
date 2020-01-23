import firebase from "firebase/app"
import "firebase/auth"

if (process.env.VUE_APP_FIREBASE_API_KEY) {
  firebase.initializeApp({
    apiKey: process.env.VUE_APP_FIREBASE_API_KEY,
    authDomain: process.env.VUE_APP_FIREBASE_AUTH_DOMAIN
  })

  firebase.auth().setPersistence("local")
}

export { firebase }