// Firebase Auth & Firestore Matchmaking Lobby Controller

import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
  doc, 
  setDoc, 
  getDoc, 
  updateDoc, 
  collection, 
  query, 
  where, 
  getDocs, 
  onSnapshot, 
  deleteDoc,
  orderBy,
  limit,
  arrayUnion,
  arrayRemove
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { auth, db, isFirebaseConfigured } from "./firebase-config.js";

// Generate a random room code
export function generateRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // No easily confused characters like I, O, 0, 1
  let code = "";
  for (let i = 0; i < 5; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export const authSystem = {
  // Check if Firebase is ready
  checkFirebaseReady() {
    if (!isFirebaseConfigured) {
      alert("Firebase is not configured! Please configure config.js with your project credentials.");
      return false;
    }
    return true;
  },

  // Register user
  async register(username, password) {
    if (!this.checkFirebaseReady()) return null;
    
    username = username.trim();
    if (username.length < 3) throw new Error("Username must be at least 3 characters.");
    if (username.includes(" ")) throw new Error("Username cannot contain spaces.");
    
    const email = `${username.toLowerCase()}@email.com`;

    try {
      // 1. Check if username document already exists in Firestore (to prevent duplicates)
      const q = query(collection(db, "users"), where("usernameLower", "==", username.toLowerCase()));
      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty) {
        throw new Error("Username is already taken.");
      }

      // 2. Create auth user
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // 3. Create Firestore record
      const userData = {
        uid: user.uid,
        username: username,
        usernameLower: username.toLowerCase(),
        highScoreScoreMode: 0,
        winsScoreMode: 0,
        lossesScoreMode: 0,
        gamesPlayedScoreMode: 0,
        winsSuddenDeath: 0,
        lossesSuddenDeath: 0,
        gamesPlayedSuddenDeath: 0,
        totalWins: 0,
        friends: [],
        createdAt: Date.now()
      };

      await setDoc(doc(db, "users", user.uid), userData);
      return userData;
    } catch (error) {
      console.error("Registration error:", error);
      throw error;
    }
  },

  // Login user
  async login(username, password) {
    if (!this.checkFirebaseReady()) return null;

    username = username.trim();
    const email = `${username.toLowerCase()}@email.com`;

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Get user document
      const userDoc = await getDoc(doc(db, "users", user.uid));
      if (userDoc.exists()) {
        return userDoc.data();
      } else {
        // Fallback: If auth exists but no Firestore doc, recreate it
        const userData = {
          uid: user.uid,
          username: username,
          usernameLower: username.toLowerCase(),
          highScoreScoreMode: 0,
          winsScoreMode: 0,
          lossesScoreMode: 0,
          gamesPlayedScoreMode: 0,
          winsSuddenDeath: 0,
          lossesSuddenDeath: 0,
          gamesPlayedSuddenDeath: 0,
          totalWins: 0,
          friends: [],
          createdAt: Date.now()
        };
        await setDoc(doc(db, "users", user.uid), userData);
        return userData;
      }
    } catch (error) {
      console.error("Login error:", error);
      throw error;
    }
  },

  // Logout user
  async logout() {
    if (!isFirebaseConfigured) return;
    await signOut(auth);
  },

  // Get user statistics
  async getUserStats(uid) {
    if (!isFirebaseConfigured) return null;
    const userDoc = await getDoc(doc(db, "users", uid));
    return userDoc.exists() ? userDoc.data() : null;
  },

  // Update statistics after game
  async updateStats(uid, mode, isWinner, score = null) {
    if (!isFirebaseConfigured) return;
    try {
      const userRef = doc(db, "users", uid);
      const userDoc = await getDoc(userRef);
      if (!userDoc.exists()) return;

      const data = userDoc.data();
      const updates = {};

      if (mode === "score") {
        updates.gamesPlayedScoreMode = (data.gamesPlayedScoreMode || 0) + 1;
        if (isWinner) {
          updates.winsScoreMode = (data.winsScoreMode || 0) + 1;
          updates.totalWins = (data.totalWins || 0) + 1;
        } else {
          updates.lossesScoreMode = (data.lossesScoreMode || 0) + 1;
        }
        if (score !== null && score > (data.highScoreScoreMode || 0)) {
          updates.highScoreScoreMode = score;
        }
      } else if (mode === "sudden_death") {
        updates.gamesPlayedSuddenDeath = (data.gamesPlayedSuddenDeath || 0) + 1;
        if (isWinner) {
          updates.winsSuddenDeath = (data.winsSuddenDeath || 0) + 1;
          updates.totalWins = (data.totalWins || 0) + 1;
        } else {
          updates.lossesSuddenDeath = (data.lossesSuddenDeath || 0) + 1;
        }
      }

      await updateDoc(userRef, updates);
    } catch (error) {
      console.error("Error updating stats:", error);
    }
  },

  // Add a friend
  async addFriend(currentUserStats, friendUsername) {
    if (!this.checkFirebaseReady()) return;
    
    friendUsername = friendUsername.trim();
    if (friendUsername.toLowerCase() === currentUserStats.username.toLowerCase()) {
      throw new Error("No puedes agregarte a ti mismo como amigo.");
    }

    // Check if the user document with that username exists
    const q = query(collection(db, "users"), where("usernameLower", "==", friendUsername.toLowerCase()));
    const querySnapshot = await getDocs(q);
    if (querySnapshot.empty) {
      throw new Error("El usuario no existe.");
    }

    const friendDoc = querySnapshot.docs[0];
    const friendData = friendDoc.data();

    // Add to our friend list in the "users" collection
    const userRef = doc(db, "users", currentUserStats.uid);
    await updateDoc(userRef, {
      friends: arrayUnion(friendData.username)
    });

    return friendData.username;
  },

  // Remove a friend
  async removeFriend(currentUserStats, friendUsername) {
    if (!this.checkFirebaseReady()) return;
    const userRef = doc(db, "users", currentUserStats.uid);
    await updateDoc(userRef, {
      friends: arrayRemove(friendUsername)
    });
  },

  // Listen to Auth changes
  onAuthChange(callback) {
    if (!isFirebaseConfigured) return () => {};
    return onAuthStateChanged(auth, async (user) => {
      if (user) {
        const stats = await this.getUserStats(user.uid);
        callback(stats);
      } else {
        callback(null);
      }
    });
  }
};

export const lobbySystem = {
  activeUnsubscribe: null,

  // Host a game
  async hostGame(userStats, mode) {
    if (!authSystem.checkFirebaseReady()) return null;

    const roomCode = generateRoomCode();
    const lobbyRef = doc(db, "lobbies", roomCode);

    const lobbyData = {
      roomCode,
      mode,
      hostUid: userStats.uid,
      hostUsername: userStats.username,
      guestUid: null,
      guestUsername: null,
      status: "waiting", // waiting, playing, closed
      createdAt: Date.now()
    };

    await setDoc(lobbyRef, lobbyData);
    return lobbyData;
  },

  // Join a game by room code
  async joinGame(userStats, roomCode) {
    if (!authSystem.checkFirebaseReady()) return null;

    roomCode = roomCode.trim().toUpperCase();
    const lobbyRef = doc(db, "lobbies", roomCode);
    const lobbyDoc = await getDoc(lobbyRef);

    if (!lobbyDoc.exists()) {
      throw new Error("Lobby not found. Please check the code.");
    }

    const data = lobbyDoc.data();
    if (data.status !== "waiting") {
      throw new Error("Game has already started or is closed.");
    }

    if (data.hostUid === userStats.uid) {
      throw new Error("You cannot join your own hosted room from the same account.");
    }

    // Update lobby state to playing
    await updateDoc(lobbyRef, {
      guestUid: userStats.uid,
      guestUsername: userStats.username,
      status: "playing"
    });

    return {
      ...data,
      guestUid: userStats.uid,
      guestUsername: userStats.username,
      status: "playing"
    };
  },

  // Quick Play matchmaking
  async quickPlay(userStats, mode, onMatchFound, onWaiting) {
    if (!authSystem.checkFirebaseReady()) return;

    try {
      // Clean up previous lobby listeners if any
      this.cancelActiveLobbyListener();

      // 1. Clean up any existing lobbies hosted by this user to prevent stale/duplicate entries
      const cleanupQuery = query(
        collection(db, "lobbies"),
        where("hostUid", "==", userStats.uid)
      );
      const cleanupSnapshot = await getDocs(cleanupQuery);
      for (const oldDoc of cleanupSnapshot.docs) {
        try {
          await deleteDoc(oldDoc.ref);
        } catch (err) {
          console.error("Error cleaning up old lobby:", err);
        }
      }

      // 2. Look for a waiting lobby in the same mode
      const q = query(
        collection(db, "lobbies"),
        where("mode", "==", mode),
        where("status", "==", "waiting")
      );

      const querySnapshot = await getDocs(q);

      // Filter out stale lobbies (no activity in last 30s) and our own just in case
      const now = Date.now();
      const activeLobbies = querySnapshot.docs
        .map(doc => ({ id: doc.id, data: doc.data() }))
        .filter(lobby => {
          if (lobby.data.hostUid === userStats.uid) return false;
          const lastActive = lobby.data.lastActive || lobby.data.createdAt || 0;
          return (now - lastActive) < 30000; // 30 seconds
        });

      if (activeLobbies.length > 0) {
        // Sort in memory by createdAt ascending to avoid index requirements
        activeLobbies.sort((a, b) => (a.data.createdAt || 0) - (b.data.createdAt || 0));

        const lobbyDoc = activeLobbies[0];
        const lobbyData = lobbyDoc.data;

        const updatedData = {
          guestUid: userStats.uid,
          guestUsername: userStats.username,
          status: "playing"
        };

        await updateDoc(doc(db, "lobbies", lobbyData.roomCode), updatedData);
        onMatchFound({
          ...lobbyData,
          ...updatedData
        });
      } else {
        // No active lobby found. Host a new game
        const lobbyData = await this.hostGame(userStats, mode);
        onWaiting(lobbyData.roomCode);
        
        // Listen for another player to join
        this.listenToLobby(lobbyData.roomCode, onMatchFound, onWaiting);
      }
    } catch (e) {
      console.error("Quick play error:", e);
      throw e;
    }
  },

  // Listen to changes in a specific lobby
  listenToLobby(roomCode, onMatchFound, onWaiting) {
    const lobbyRef = doc(db, "lobbies", roomCode);
    
    this.activeUnsubscribe = onSnapshot(lobbyRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.value ? docSnap.value() : docSnap.data();
        if (data.status === "playing") {
          this.cancelActiveLobbyListener();
          onMatchFound(data);
        } else if (data.status === "waiting") {
          onWaiting(roomCode);
        }
      }
    });
  },

  cancelActiveLobbyListener() {
    if (this.activeUnsubscribe) {
      this.activeUnsubscribe();
      this.activeUnsubscribe = null;
    }
  },

  // Delete/close lobby
  async deleteLobby(roomCode) {
    if (!isFirebaseConfigured) return;
    try {
      this.cancelActiveLobbyListener();
      await deleteDoc(doc(db, "lobbies", roomCode));
    } catch (e) {
      console.error("Error closing lobby:", e);
    }
  },

  // Update heartbeat for room
  async updateHeartbeat(roomCode) {
    if (!isFirebaseConfigured) return;
    try {
      const lobbyRef = doc(db, "lobbies", roomCode);
      await updateDoc(lobbyRef, { lastActive: Date.now() });
    } catch (e) {
      console.error("Error updating heartbeat:", e);
    }
  }
};

export const inviteSystem = {
  // Send invite to a friend
  async sendInvite(senderStats, receiverUsername, mode) {
    if (!authSystem.checkFirebaseReady()) return null;
    
    // Get receiver stats to find their UID
    const q = query(collection(db, "users"), where("usernameLower", "==", receiverUsername.toLowerCase()));
    const querySnapshot = await getDocs(q);
    if (querySnapshot.empty) {
      throw new Error("El usuario no existe.");
    }
    const receiverData = querySnapshot.docs[0].data();
    
    const roomCode = generateRoomCode();
    const inviteId = `${senderStats.uid}_${receiverData.uid}_${Date.now()}`;
    const inviteRef = doc(db, "invites", inviteId);
    
    const inviteData = {
      id: inviteId,
      senderUid: senderStats.uid,
      senderUsername: senderStats.username,
      receiverUid: receiverData.uid,
      receiverUsername: receiverData.username,
      roomCode: roomCode,
      mode: mode,
      status: "pending", // pending, accepted, declined
      createdAt: Date.now()
    };
    
    await setDoc(inviteRef, inviteData);
    return inviteData;
  },
  
  // Listen to incoming pending invites
  listenToIncomingInvites(currentUserUid, onInviteReceived, onInviteRemoved) {
    if (!isFirebaseConfigured) return () => {};
    const q = query(
      collection(db, "invites"),
      where("receiverUid", "==", currentUserUid),
      where("status", "==", "pending")
    );
    
    return onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === "added") {
          onInviteReceived(change.doc.data());
        } else if (change.type === "removed") {
          if (onInviteRemoved) onInviteRemoved(change.doc.id);
        }
      });
    });
  },
  
  // Listen to changes in a specific invite (useful for the sender)
  listenToInvite(inviteId, onUpdate) {
    if (!isFirebaseConfigured) return () => {};
    const inviteRef = doc(db, "invites", inviteId);
    return onSnapshot(inviteRef, (docSnap) => {
      if (docSnap.exists()) {
        onUpdate(docSnap.data());
      }
    });
  },
  
  // Accept invite
  async acceptInvite(inviteId) {
    if (!isFirebaseConfigured) return;
    const inviteRef = doc(db, "invites", inviteId);
    await updateDoc(inviteRef, {
      status: "accepted"
    });
  },
  
  // Decline/Cancel invite
  async declineInvite(inviteId) {
    if (!isFirebaseConfigured) return;
    const inviteRef = doc(db, "invites", inviteId);
    await updateDoc(inviteRef, {
      status: "declined"
    });
  },
  
  async cancelInvite(inviteId) {
    if (!isFirebaseConfigured) return;
    try {
      await deleteDoc(doc(db, "invites", inviteId));
    } catch (err) {
      console.error("Error cancelling invite:", err);
    }
  }
};
