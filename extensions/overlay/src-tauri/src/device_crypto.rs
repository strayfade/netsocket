use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use ed25519_dalek::{Signature, Signer, SigningKey, Verifier, VerifyingKey};
use hkdf::Hkdf;
use rand::rngs::OsRng;
use sha2::Sha256;
use x25519_dalek::{PublicKey as X25519Public, StaticSecret as X25519Secret};

pub const PROTOCOL_INFO: &[u8] = b"netsocket-device-v1";

#[derive(Clone)]
pub struct DeviceIdentity {
    pub public_key_b64: String,
    pub private_key_b64: String,
}

impl DeviceIdentity {
    pub fn generate() -> Self {
        let signing = SigningKey::generate(&mut OsRng);
        Self {
            public_key_b64: B64.encode(signing.verifying_key().as_bytes()),
            private_key_b64: B64.encode(signing.to_bytes()),
        }
    }

    pub fn from_stored(public_key_b64: &str, private_key_b64: &str) -> Option<Self> {
        if public_key_b64.trim().is_empty() || private_key_b64.trim().is_empty() {
            return None;
        }
        let priv_bytes = B64.decode(private_key_b64).ok()?;
        if priv_bytes.len() != 32 {
            return None;
        }
        let mut seed = [0u8; 32];
        seed.copy_from_slice(&priv_bytes);
        let signing = SigningKey::from_bytes(&seed);
        let derived_pub = B64.encode(signing.verifying_key().as_bytes());
        if derived_pub != public_key_b64.trim() {
            // Prefer derived public key if stored public is stale/mismatched.
        }
        Some(Self {
            public_key_b64: derived_pub,
            private_key_b64: private_key_b64.trim().to_string(),
        })
    }

    pub fn sign(&self, message: &str) -> Result<String, String> {
        let priv_bytes = B64
            .decode(&self.private_key_b64)
            .map_err(|e| e.to_string())?;
        if priv_bytes.len() != 32 {
            return Err("invalid_identity_private_key".into());
        }
        let mut seed = [0u8; 32];
        seed.copy_from_slice(&priv_bytes);
        let signing = SigningKey::from_bytes(&seed);
        let sig = signing.sign(message.as_bytes());
        Ok(B64.encode(sig.to_bytes()))
    }
}

pub struct EphemeralEcdh {
    pub public_key_b64: String,
    secret: X25519Secret,
}

impl EphemeralEcdh {
    pub fn generate() -> Self {
        let secret = X25519Secret::random_from_rng(OsRng);
        let public = X25519Public::from(&secret);
        Self {
            public_key_b64: B64.encode(public.as_bytes()),
            secret,
        }
    }

    pub fn derive_session_key(
        &self,
        peer_public_b64: &str,
        challenge_b64: &str,
    ) -> Result<[u8; 32], String> {
        let peer_bytes = B64.decode(peer_public_b64).map_err(|e| e.to_string())?;
        if peer_bytes.len() != 32 {
            return Err("invalid_peer_ecdh_public_key".into());
        }
        let mut peer_arr = [0u8; 32];
        peer_arr.copy_from_slice(&peer_bytes);
        let shared = self.secret.diffie_hellman(&X25519Public::from(peer_arr));
        let salt = B64.decode(challenge_b64).map_err(|e| e.to_string())?;
        let hk = Hkdf::<Sha256>::new(Some(&salt), shared.as_bytes());
        let mut okm = [0u8; 32];
        hk.expand(PROTOCOL_INFO, &mut okm)
            .map_err(|_| "hkdf_expand_failed".to_string())?;
        Ok(okm)
    }
}

pub fn verify_ed25519(public_key_b64: &str, message: &str, signature_b64: &str) -> bool {
    let Ok(pub_bytes) = B64.decode(public_key_b64) else {
        return false;
    };
    if pub_bytes.len() != 32 {
        return false;
    }
    let mut arr = [0u8; 32];
    arr.copy_from_slice(&pub_bytes);
    let Ok(verifying) = VerifyingKey::from_bytes(&arr) else {
        return false;
    };
    let Ok(sig_bytes) = B64.decode(signature_b64) else {
        return false;
    };
    let Ok(sig_arr) = <[u8; 64]>::try_from(sig_bytes.as_slice()) else {
        return false;
    };
    let signature = Signature::from_bytes(&sig_arr);
    verifying.verify(message.as_bytes(), &signature).is_ok()
}

pub fn build_challenge_message(
    challenge: &str,
    device_id: &str,
    device_identity_public_key: &str,
    device_ecdh_public_key: &str,
    server_identity_public_key: &str,
    server_ecdh_public_key: &str,
) -> String {
    [
        "netsocket-device-auth-v1",
        challenge,
        device_id,
        device_identity_public_key,
        device_ecdh_public_key,
        server_identity_public_key,
        server_ecdh_public_key,
    ]
    .join("\n")
}

pub fn encrypt_payload(session_key: &[u8; 32], plaintext: &serde_json::Value) -> Result<(String, String), String> {
    let cipher = Aes256Gcm::new_from_slice(session_key).map_err(|e| e.to_string())?;
    let mut nonce_bytes = [0u8; 12];
    rand::RngCore::fill_bytes(&mut OsRng, &mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);
    let body = serde_json::to_vec(plaintext).map_err(|e| e.to_string())?;
    let ciphertext = cipher
        .encrypt(nonce, body.as_ref())
        .map_err(|e| e.to_string())?;
    Ok((B64.encode(nonce_bytes), B64.encode(ciphertext)))
}

pub fn decrypt_payload(
    session_key: &[u8; 32],
    nonce_b64: &str,
    ciphertext_b64: &str,
) -> Result<serde_json::Value, String> {
    let cipher = Aes256Gcm::new_from_slice(session_key).map_err(|e| e.to_string())?;
    let nonce_bytes = B64.decode(nonce_b64).map_err(|e| e.to_string())?;
    if nonce_bytes.len() != 12 {
        return Err("invalid_nonce".into());
    }
    let nonce = Nonce::from_slice(&nonce_bytes);
    let ciphertext = B64.decode(ciphertext_b64).map_err(|e| e.to_string())?;
    let plaintext = cipher
        .decrypt(nonce, ciphertext.as_ref())
        .map_err(|e| e.to_string())?;
    serde_json::from_slice(&plaintext).map_err(|e| e.to_string())
}
