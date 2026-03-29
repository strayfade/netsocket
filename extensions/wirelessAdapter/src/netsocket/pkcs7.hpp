#include <Arduino.h>
#include <vector>
#include <mbedtls/aes.h>
#include <mbedtls/base64.h>
#include <mbedtls/ctr_drbg.h>
#include <mbedtls/entropy.h>

#define _NETSOCKET_KEY { 0xe8, 0x20, 0x8e, 0xc5, 0x63, 0xc8, 0xb9, 0x36, 0x13, 0x9a, 0x3a, 0xe7, 0x3b, 0x50, 0xd3, 0xcd, 0x1a, 0x4d, 0xe2, 0xdc, 0x5c, 0x12, 0xaf, 0x8b, 0xeb, 0x45, 0x75, 0xec, 0xef, 0x8a, 0x47, 0xc2 }

namespace pkcs7 {
    void pad(std::vector<uint8_t>& data, size_t blockSize) {
        size_t padLen = blockSize - (data.size() % blockSize);
        for (size_t i = 0; i < padLen; i++) {
            data.push_back((uint8_t)padLen);
        }
    }

    void unpad(std::vector<uint8_t>& data) {
        if (data.empty()) return;

        uint8_t padLen = data.back();
        if (padLen > data.size()) return;

        data.resize(data.size() - padLen);
    }

    std::string encryptString(const std::string& plaintext) {
        const size_t BLOCK_SIZE = 16;

        const uint8_t privateKey[] = _NETSOCKET_KEY;
        const unsigned char* key = privateKey;

        // Copy plaintext into vector
        std::vector<uint8_t> input(plaintext.begin(), plaintext.end());
        pad(input, BLOCK_SIZE);

        // Generate random IV
        uint8_t iv[BLOCK_SIZE];

        mbedtls_entropy_context entropy;
        mbedtls_ctr_drbg_context ctr_drbg;
        const char* pers = "aes_iv";

        mbedtls_entropy_init(&entropy);
        mbedtls_ctr_drbg_init(&ctr_drbg);
        mbedtls_ctr_drbg_seed(&ctr_drbg, mbedtls_entropy_func, &entropy, (const unsigned char*)pers, strlen(pers));

        mbedtls_ctr_drbg_random(&ctr_drbg, iv, BLOCK_SIZE);

        // Setup AES
        mbedtls_aes_context aes;
        mbedtls_aes_init(&aes);
        mbedtls_aes_setkey_enc(&aes, (const unsigned char*)key, 256);

        std::vector<uint8_t> output(input.size());
        uint8_t iv_copy[BLOCK_SIZE];
        memcpy(iv_copy, iv, BLOCK_SIZE);

        mbedtls_aes_crypt_cbc(&aes, MBEDTLS_AES_ENCRYPT, input.size(), iv_copy, input.data(), output.data());

        mbedtls_aes_free(&aes);

        // Prepend IV to ciphertext
        std::vector<uint8_t> combined(iv, iv + BLOCK_SIZE);
        combined.insert(combined.end(), output.begin(), output.end());

        // Base64 encode
        size_t base64_len;
        mbedtls_base64_encode(nullptr, 0, &base64_len, combined.data(), combined.size());

        std::vector<uint8_t> base64_out(base64_len);
        mbedtls_base64_encode(base64_out.data(), base64_len, &base64_len, combined.data(), combined.size());

        return std::string(base64_out.begin(), base64_out.end());
    }

    std::string decryptString(const std::string& base64Cipher) {
        const size_t BLOCK_SIZE = 16;

        const uint8_t privateKey[] = _NETSOCKET_KEY;
        const unsigned char* key = privateKey;

        // Base64 decode
        size_t decoded_len;
        mbedtls_base64_decode(nullptr, 0, &decoded_len, (const unsigned char*)base64Cipher.data(), base64Cipher.size());

        std::vector<uint8_t> decoded(decoded_len);
        mbedtls_base64_decode(decoded.data(), decoded_len, &decoded_len, (const unsigned char*)base64Cipher.data(), base64Cipher.size());

        if (decoded_len < BLOCK_SIZE) return "";

        // Extract IV
        uint8_t iv[BLOCK_SIZE];
        memcpy(iv, decoded.data(), BLOCK_SIZE);

        size_t cipher_len = decoded_len - BLOCK_SIZE;
        uint8_t* cipher_text = decoded.data() + BLOCK_SIZE;

        // Setup AES
        mbedtls_aes_context aes;
        mbedtls_aes_init(&aes);
        mbedtls_aes_setkey_dec(&aes, (const unsigned char*)key, 256);

        std::vector<uint8_t> output(cipher_len);
        uint8_t iv_copy[BLOCK_SIZE];
        memcpy(iv_copy, iv, BLOCK_SIZE);

        mbedtls_aes_crypt_cbc(&aes, MBEDTLS_AES_DECRYPT, cipher_len, iv_copy, cipher_text, output.data());

        mbedtls_aes_free(&aes);

        unpad(output);

        return std::string(output.begin(), output.end());
    }
}