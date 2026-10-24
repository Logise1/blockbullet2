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
  arrayRemove,
  getCountFromServer
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { auth, db, isFirebaseConfigured } from "./firebase-config.js";

export function mapAuthError(error) {
  const code = error?.code || "";
  const map = {
    "auth/email-already-in-use": "Ese nombre ya está en uso.",
    "auth/invalid-email": "Nombre de usuario no válido.",
    "auth/weak-password": "La contraseña debe tener al menos 6 caracteres.",
    "auth/user-not-found": "Usuario o contraseña incorrectos.",
    "auth/wrong-password": "Usuario o contraseña incorrectos.",
    "auth/invalid-credential": "Usuario o contraseña incorrectos.",
    "auth/too-many-requests": "Demasiados intentos. Espera un momento.",
    "auth/network-request-failed": "Sin conexión. Revisa tu red.",
    "auth/user-disabled": "Esta cuenta está deshabilitada."
  };
  if (map[code]) return map[code];
  if (error?.message && !String(error.message).startsWith("Firebase")) return error.message;
  return "No se pudo completar la operación.";
}

export function validateUsername(username) {
  const value = (username || "").trim();
  if (value.length < 3) throw new Error("El usuario debe tener al menos 3 caracteres.");
  if (value.length > 15) throw new Error("El usuario no puede superar 15 caracteres.");
  if (!/^[a-zA-Z0-9_]+$/.test(value)) throw new Error("Solo letras, números y _.");
  return value;
}

export function validatePassword(password) {
  if (!password || password.length < 6) {
    throw new Error("La contraseña debe tener al menos 6 caracteres.");
  }
  return password;
}

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
    return isFirebaseConfigured;
  },

  // Register user
  async register(username, password) {
    if (!isFirebaseConfigured) {
      throw new Error("Firebase no está configurado. Revisa config.js.");
    }
    username = validateUsername(username);
    validatePassword(password);
    
    const email = `${username.toLowerCase()}@email.com`;

    try {
      const q = query(collection(db, "users"), where("usernameLower", "==", username.toLowerCase()));
      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty) {
        throw new Error("Ese nombre ya está en uso.");
      }

      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

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
        pp: 1000,
        highScoreSolo: 0,
        gamesPlayedSolo: 0,
        createdAt: Date.now(),
        lastSeen: Date.now()
      };

      await setDoc(doc(db, "users", user.uid), userData);
      return userData;
    } catch (error) {
      console.error("Registration error:", error);
      throw new Error(mapAuthError(error));
    }
  },

  // Login user
  async login(username, password) {
    if (!isFirebaseConfigured) {
      throw new Error("Firebase no está configurado. Revisa config.js.");
    }
    username = (username || "").trim();
    if (username.length < 3) throw new Error("El usuario debe tener al menos 3 caracteres.");
    validatePassword(password);

    const email = `${username.toLowerCase()}@email.com`;

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      const userDoc = await getDoc(doc(db, "users", user.uid));
      if (userDoc.exists()) {
        const data = userDoc.data();
        try {
          await updateDoc(doc(db, "users", user.uid), { lastSeen: Date.now() });
        } catch (_) { /* ignore heartbeat write */ }
        return { ...data, lastSeen: Date.now() };
      }

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
        pp: 1000,
        highScoreSolo: 0,
        gamesPlayedSolo: 0,
        createdAt: Date.now(),
        lastSeen: Date.now()
      };
      await setDoc(doc(db, "users", user.uid), userData);
      return userData;
    } catch (error) {
      console.error("Login error:", error);
      throw new Error(mapAuthError(error));
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
  async updateStats(uid, mode, isWinner, score = null, newPP = null) {
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
      } else if (mode === "solo") {
        updates.gamesPlayedSolo = (data.gamesPlayedSolo || 0) + 1;
        if (score !== null && score > (data.highScoreSolo || 0)) {
          updates.highScoreSolo = score;
        }
        if (score !== null && score > (data.highScoreScoreMode || 0)) {
          updates.highScoreScoreMode = score;
        }
      }

      if (newPP !== null && newPP !== undefined && mode !== "solo") {
        updates.pp = newPP;
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

  // Get top 10 players globally by PP
  async getTopPlayers() {
    if (!isFirebaseConfigured) return [];
    try {
      const q = query(
        collection(db, "users"),
        orderBy("pp", "desc"),
        limit(12)
      );
      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(docSnap => docSnap.data());
    } catch (err) {
      console.error("Error getting top players:", err);
      return [];
    }
  },

  async getUserRank(pp) {
    if (!isFirebaseConfigured) return null;
    try {
      const q = query(collection(db, "users"), where("pp", ">", pp || 1000));
      const snap = await getCountFromServer(q);
      return snap.data().count + 1;
    } catch (err) {
      console.error("Error getting user rank:", err);
      return null;
    }
  },

  async getLeaderboard(userData) {
    const players = await this.getTopPlayers();
    let rank = players.findIndex((p) =>
      (userData?.uid && p.uid === userData.uid) ||
      (userData?.username && p.username === userData.username)
    );
    if (rank >= 0) rank += 1;
    else rank = await this.getUserRank(userData?.pp || 1000);
    return { players, rank };
  },

  // Get full details of all friends (for reading their PPs)
  async getFriendsDetails(friendUsernames) {
    if (!isFirebaseConfigured || !friendUsernames || friendUsernames.length === 0) return [];
    try {
      const details = [];
      // Firestore 'in' query has a limit of 10 items in standard batches, let's query in chunks of 10
      for (let i = 0; i < friendUsernames.length; i += 10) {
        const chunk = friendUsernames.slice(i, i + 10);
        const q = query(collection(db, "users"), where("username", "in", chunk));
        const snap = await getDocs(q);
        snap.forEach(doc => details.push(doc.data()));
      }
      // Sort friends by PP descending for clean rendering
      details.sort((a, b) => (b.pp || 1000) - (a.pp || 1000));
      return details;
    } catch (err) {
      console.error("Error getting friends details:", err);
      return [];
    }
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
