/**
 * Aides pour les interactions Solana
 */

class SolanaHelpers {
    /**
     * Sérialise l'instruction de burn
     */
    static serializeBurnInstruction(solAmount, taxRate) {
        const buffer = new ArrayBuffer(17);
        const view = new DataView(buffer);
        
        // Discriminateur pour l'instruction burn
        const discriminator = new Uint8Array([
            203, 142, 66, 81, 199, 170, 67, 130
        ]);
        
        const uint8Array = new Uint8Array(buffer);
        for (let i = 0; i < 8; i++) {
            uint8Array[i] = discriminator[i];
        }
        
        view.setBigUint64(8, BigInt(solAmount), true);
        view.setUint8(16, taxRate);
        
        return new Uint8Array(buffer);
    }

    /**
     * Sérialise l'instruction de claim
     */
    static serializeClaimInstruction() {
        const buffer = new ArrayBuffer(8);
        
        // Discriminateur pour l'instruction claim
        const discriminator = new Uint8Array([62, 198, 214, 193, 213, 159, 108, 210]);
        
        const uint8Array = new Uint8Array(buffer);
        for (let i = 0; i < 8; i++) {
            uint8Array[i] = discriminator[i];
        }
        
        return uint8Array;
    }

    /**
     * Sérialise l'instruction d'initialisation
     */
    static serializeInitInstruction() {
        return new Uint8Array([175, 175, 109, 31, 13, 152, 155, 237]);
    }

    /**
     * Crée une transaction de burn
     */
    static async createBurnTransaction(
        userPublicKey,
        globalStatePda,
        userAccountPda,
        yrmMintPda,
        userTokenAccountPda,
        solVaultPda,
        creatorPubkey,
        burnAmount,
        taxRate,
        connection
    ) {
        const transaction = new solanaWeb3.Transaction();
        const burnAmountLamports = Math.floor(burnAmount * solanaWeb3.LAMPORTS_PER_SOL);
        const instructionData = this.serializeBurnInstruction(burnAmountLamports, taxRate);

        const burnInstruction = new solanaWeb3.TransactionInstruction({
            keys: [
                { pubkey: globalStatePda, isSigner: false, isWritable: true },
                { pubkey: userAccountPda, isSigner: false, isWritable: true },
                { pubkey: yrmMintPda, isSigner: false, isWritable: true },
                { pubkey: userTokenAccountPda, isSigner: false, isWritable: true },
                { pubkey: solVaultPda, isSigner: false, isWritable: true },
                { pubkey: creatorPubkey, isSigner: false, isWritable: true },
                { pubkey: userPublicKey, isSigner: true, isWritable: true },
                { pubkey: new solanaWeb3.PublicKey(window.YM_CONFIG.PROGRAMS.TOKEN), isSigner: false, isWritable: false },
                { pubkey: new solanaWeb3.PublicKey(window.YM_CONFIG.PROGRAMS.ASSOCIATED_TOKEN), isSigner: false, isWritable: false },
                { pubkey: solanaWeb3.SystemProgram.programId, isSigner: false, isWritable: false },
            ],
            programId: new solanaWeb3.PublicKey(window.YM_CONFIG.PROGRAM_ID),
            data: instructionData
        });
        
        transaction.add(burnInstruction);
        transaction.feePayer = userPublicKey;
        
        const { blockhash } = await connection.getLatestBlockhash('confirmed');
        transaction.recentBlockhash = blockhash;
        
        return transaction;
    }

    /**
     * Crée une transaction de claim
     */
    static async createClaimTransaction(
        userPublicKey,
        globalStatePda,
        userAccountPda,
        yrmMintPda,
        userTokenAccountPda,
        connection
    ) {
        const transaction = new solanaWeb3.Transaction();
        const instructionData = this.serializeClaimInstruction();
        
        const instruction = new solanaWeb3.TransactionInstruction({
            keys: [
                { pubkey: globalStatePda, isSigner: false, isWritable: true },
                { pubkey: userAccountPda, isSigner: false, isWritable: true },
                { pubkey: yrmMintPda, isSigner: false, isWritable: true },
                { pubkey: userTokenAccountPda, isSigner: false, isWritable: true },
                { pubkey: userPublicKey, isSigner: true, isWritable: false },
                { pubkey: new solanaWeb3.PublicKey(window.YM_CONFIG.PROGRAMS.TOKEN), isSigner: false, isWritable: false },
            ],
            programId: new solanaWeb3.PublicKey(window.YM_CONFIG.PROGRAM_ID),
            data: instructionData
        });
        
        transaction.add(instruction);
        transaction.feePayer = userPublicKey;
        
        const { blockhash } = await connection.getLatestBlockhash('confirmed');
        transaction.recentBlockhash = blockhash;
        
        return transaction;
    }

    /**
     * Crée une transaction d'initialisation
     */
    static async createInitTransaction(
        userPublicKey,
        globalStatePda,
        yrmMintPda,
        connection
    ) {
        const transaction = new solanaWeb3.Transaction();
        const initDiscriminator = this.serializeInitInstruction();
        
        const initInstruction = new solanaWeb3.TransactionInstruction({
            keys: [
                { pubkey: globalStatePda, isSigner: false, isWritable: true },
                { pubkey: yrmMintPda, isSigner: false, isWritable: true },
                { pubkey: userPublicKey, isSigner: true, isWritable: true },
                { pubkey: new solanaWeb3.PublicKey(window.YM_CONFIG.PROGRAMS.TOKEN), isSigner: false, isWritable: false },
                { pubkey: solanaWeb3.SystemProgram.programId, isSigner: false, isWritable: false },
            ],
            programId: new solanaWeb3.PublicKey(window.YM_CONFIG.PROGRAM_ID),
            data: initDiscriminator
        });
        
        transaction.add(initInstruction);
        transaction.feePayer = userPublicKey;
        
        const { blockhash } = await connection.getLatestBlockhash('confirmed');
        transaction.recentBlockhash = blockhash;
        
        return transaction;
    }

    /**
     * Obtient la supply totale du token YRM
     */
    static async getTotalSupply(connection, yrmMintPda) {
        try {
            const mintAccountInfo = await connection.getAccountInfo(yrmMintPda);
            if (mintAccountInfo && mintAccountInfo.data) {
                const data = mintAccountInfo.data;
                const view = new DataView(data.buffer);
                const supply = view.getBigUint64(36, true);
                return Number(supply) / window.YM_CONFIG.YRM_DECIMALS_MULTIPLIER;
            }
            return 0;
        } catch (error) {
            return 0;
        }
    }

    /**
     * Obtient le solde YRM d'un utilisateur
     */
    static async getYRMBalance(connection, userTokenAccountPda) {
        try {
            const tokenAccountInfo = await connection.getAccountInfo(userTokenAccountPda);
            if (tokenAccountInfo && tokenAccountInfo.data) {
                const data = tokenAccountInfo.data;
                const view = new DataView(data.buffer);
                const balance = view.getBigUint64(64, true);
                return Number(balance) / window.YM_CONFIG.YRM_DECIMALS_MULTIPLIER;
            }
            return 0;
        } catch (error) {
            return 0;
        }
    }

    /**
     * Obtient le solde SOL d'un utilisateur
     */
    static async getSOLBalance(connection, userPublicKey) {
        try {
            const balance = await connection.getBalance(userPublicKey);
            return balance / solanaWeb3.LAMPORTS_PER_SOL;
        } catch (error) {
            return 0;
        }
    }

    /**
     * Vérifie si le programme est initialisé
     */
    static async isProgramInitialized(connection, globalStatePda) {
        try {
            const globalStateInfo = await connection.getAccountInfo(globalStatePda);
            return !!globalStateInfo;
        } catch (error) {
            return false;
        }
    }

    /**
     * Obtient le slot de genèse du programme
     */
    static async getProgramGenesisSlot(connection, globalStatePda) {
        try {
            const globalStateInfo = await connection.getAccountInfo(globalStatePda);
            if (globalStateInfo && globalStateInfo.data) {
                const view = new DataView(globalStateInfo.data.buffer);
                let offset = 8; // discriminator
                offset += 32; // creator pubkey
                offset += 8; // total_supply
                offset += 8; // total_burned
                return Number(view.getBigUint64(offset, true));
            }
            return window.YM_CONFIG.REFERENCE_GENESIS_SLOT;
        } catch (error) {
            return window.YM_CONFIG.REFERENCE_GENESIS_SLOT;
        }
    }

    /**
     * Valide l'adresse du créateur
     */
    static async validateCreatorAddress(connection, globalStatePda, expectedCreatorAddress) {
        try {
            const globalStateInfo = await connection.getAccountInfo(globalStatePda);
            if (globalStateInfo && globalStateInfo.data) {
                const view = new DataView(globalStateInfo.data.buffer);
                let offset = 8; // discriminator
                
                const creatorBytes = new Uint8Array(globalStateInfo.data.buffer, offset, 32);
                const storedCreatorPubkey = new solanaWeb3.PublicKey(creatorBytes);
                const expectedCreatorPubkey = new solanaWeb3.PublicKey(expectedCreatorAddress);
                
                return storedCreatorPubkey.equals(expectedCreatorPubkey);
            }
            return true; // Si pas encore initialisé, on considère que c'est valide
        } catch (error) {
            return true;
        }
    }
}

// Exposer la classe globalement
window.SolanaHelpers = SolanaHelpers;