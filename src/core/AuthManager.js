import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';

// NOTE: 以下の設定はユーザーがFirebaseコンソールで取得したものに置き換える必要があります
// とりあえずコードが動くように器だけ作成します
const firebaseConfig = {
    apiKey: "AIzaSyC_6pl-6KY7LdYBZ85gWwicUZML0JyzE14",
    authDomain: "autovj-8dc55.firebaseapp.com",
    projectId: "autovj-8dc55",
    storageBucket: "autovj-8dc55.firebasestorage.app",
    messagingSenderId: "1010442312331",
    appId: "1:1010442312331:web:c5372cef7c68600d64d28e",
    measurementId: "G-VRV9VVRYG2"
};

class AuthManager {
    constructor() {
        this.app = initializeApp(firebaseConfig);
        this.auth = getAuth(this.app);
        this.db = getFirestore(this.app);
        this.user = null;
        this.isPaid = false;
        this.onStatusChange = null;
    }

    init(callback) {
        onAuthStateChanged(this.auth, async (user) => {
            this.user = user;
            if (user) {
                // ユーザー情報をFirestoreから取得
                await this.syncUserStatus(user);
            } else {
                this.isPaid = false;
                if (callback) callback(null, false);
            }
        });
    }

    async syncUserStatus(user) {
        const userDocRef = doc(this.db, 'users', user.uid);

        // リアルタイムでステータスを監視（支払いが完了した瞬間に反映されるように）
        onSnapshot(userDocRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                this.isPaid = data.isPaid || false;
            } else {
                // ドキュメントがない場合は新規作成（初期は無料会員）
                setDoc(userDocRef, {
                    email: user.email,
                    isPaid: false,
                    createdAt: new Date()
                });
                this.isPaid = false;
            }

            if (this.onStatusChange) {
                this.onStatusChange(this.user, this.isPaid);
            }
        });
    }

    async login() {
        const provider = new GoogleAuthProvider();
        try {
            const result = await signInWithPopup(this.auth, provider);
            return result.user;
        } catch (error) {
            console.error("Login Error:", error);
            throw error;
        }
    }

    async logout() {
        await signOut(this.auth);
    }
}

export const authManager = new AuthManager();
