/**
 * Fonctions utilitaires pour YourMine
 */

class YMUtils {
    /**
     * Formate un nombre avec un nombre spécifique de décimales
     */
    static formatNumber(num, decimals = window.YM_CONFIG.UI.format_decimals) {
        if (num === 0) return '0';
        if (num < 0.00000000001 && num > 0) return '< 0.00000000001';
        return parseFloat(num.toFixed(decimals)).toString();
    }

    /**
     * Vérifie si l'appareil est mobile
     */
    static isMobileDevice() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }

    /**
     * Crée un deep link pour Phantom wallet
     */
    static createPhantomDeepLink() {
        const currentURL = `${window.location.origin}${window.location.pathname}`;
        const encodedURL = encodeURIComponent(currentURL);
        const refURL = encodeURIComponent(window.location.origin);
        
        return `https://phantom.app/ul/browse/${encodedURL}?ref=${refURL}`;
    }

    /**
     * Affiche une notification
     */
    static showNotification(message, type = 'info') {
        // Supprimer les notifications existantes
        const existingNotifications = document.querySelectorAll('.notification');
        existingNotifications.forEach(notif => notif.remove());

        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 12px 24px;
            border-radius: 8px;
            color: white;
            font-weight: 500;
            z-index: 10000;
            transform: translateX(100%);
            transition: transform 0.3s ease;
            max-width: 400px;
            word-wrap: break-word;
            ${type === 'success' ? 'background: #10b981;' : ''}
            ${type === 'error' ? 'background: #ef4444;' : ''}
            ${type === 'info' ? 'background: #3b82f6;' : ''}
        `;
        
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.transform = 'translateX(0)';
        }, 100);

        setTimeout(() => {
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => notification.remove(), 300);
        }, window.YM_CONFIG.UI.notification_duration);
    }

    /**
     * Calcule les PDAs (Program Derived Addresses)
     */
    static async calculatePDAs(programId) {
        const programIdKey = new solanaWeb3.PublicKey(programId);
        
        const [globalStatePda] = await solanaWeb3.PublicKey.findProgramAddress(
            [new TextEncoder().encode('global_state')],
            programIdKey
        );
        
        const [yrmMintPda] = await solanaWeb3.PublicKey.findProgramAddress(
            [new TextEncoder().encode('yrm_mint')],
            programIdKey
        );
        
        const [solVaultPda] = await solanaWeb3.PublicKey.findProgramAddress(
            [new TextEncoder().encode('sol_vault')],
            programIdKey
        );
        
        return {
            globalStatePda,
            yrmMintPda,
            solVaultPda
        };
    }

    /**
     * Calcule les PDAs utilisateur
     */
    static async calculateUserPDAs(userPublicKey, yrmMintPda, programId) {
        const programIdKey = new solanaWeb3.PublicKey(programId);
        
        const userAccountPda = await solanaWeb3.PublicKey.findProgramAddress(
            [
                new TextEncoder().encode('user_account'),
                userPublicKey.toBytes()
            ],
            programIdKey
        );

        const userTokenAccountPda = await solanaWeb3.PublicKey.findProgramAddress(
            [
                userPublicKey.toBuffer(),
                new solanaWeb3.PublicKey(window.YM_CONFIG.PROGRAMS.TOKEN).toBuffer(),
                yrmMintPda.toBuffer(),
            ],
            new solanaWeb3.PublicKey(window.YM_CONFIG.PROGRAMS.ASSOCIATED_TOKEN)
        );

        return {
            userAccountPda,
            userTokenAccountPda
        };
    }

    /**
     * Parse les données du compte utilisateur
     */
    static parseUserAccountData(data) {
        try {
            if (data.length < 65) {
                return {
                    taxRate: window.YM_CONFIG.ALGORITHM.default_tax_rate,
                    lastActionSlot: 0,
                    totalBurned: 0,
                    lastBurnAmount: 0
                };
            }
            
            const view = new DataView(data.buffer);
            let offset = 8; // Skip discriminator
            offset += 32; // Skip user pubkey
            
            const taxRate = view.getUint8(offset);
            offset += 1;
            
            const lastActionSlot = Number(view.getBigUint64(offset, true));
            offset += 8;
            
            const totalBurned = Number(view.getBigUint64(offset, true));
            offset += 8;
            
            const lastBurnAmount = Number(view.getBigUint64(offset, true));
            
            return {
                taxRate,
                lastActionSlot,
                totalBurned,
                lastBurnAmount
            };
        } catch (error) {
            return {
                taxRate: window.YM_CONFIG.ALGORITHM.default_tax_rate,
                lastActionSlot: 0,
                totalBurned: 0,
                lastBurnAmount: 0
            };
        }
    }

    /**
     * Parse les données du compte utilisateur depuis un buffer
     */
    static parseUserAccountDataFromBuffer(buffer) {
        try {
            if (buffer.length < 65) return null;
            
            const view = new DataView(buffer);
            let offset = 8;
            offset += 32;
            
            const taxRate = view.getUint8(offset);
            offset += 1;
            
            const lastActionSlot = Number(view.getBigUint64(offset, true));
            offset += 8;
            
            const totalBurned = Number(view.getBigUint64(offset, true));
            offset += 8;
            
            const lastBurnAmount = Number(view.getBigUint64(offset, true));
            
            return {
                taxRate,
                lastActionSlot,
                totalBurned,
                lastBurnAmount
            };
        } catch (error) {
            return null;
        }
    }

    /**
     * Calcule le montant récupérable
     */
    static calculateClaimable(lastBurnAmount, lastActionSlot, currentSlot, taxRate) {
        try {
            if (lastBurnAmount === 0 || lastActionSlot === 0) {
                return 0;
            }

            if (!currentSlot || currentSlot <= lastActionSlot) {
                return 0;
            }

            const blocksSinceAction = Math.max(1, currentSlot - lastActionSlot);
            const blocksFromGenesis = Math.max(1, currentSlot - window.YM_CONFIG.REFERENCE_GENESIS_SLOT);

            if (blocksSinceAction < 30) {
                return 0;
            }

            const blocksSinceF64 = parseFloat(blocksSinceAction);
            const blocksFromGenesisF64 = parseFloat(blocksFromGenesis);
            const lastBurnAmountSol = lastBurnAmount / 1000000000.0;
            const taxRateF64 = Math.min(taxRate, 40) / 100.0;

            if (!isFinite(blocksSinceF64) || !isFinite(blocksFromGenesisF64) || !isFinite(lastBurnAmountSol)) {
                return 0;
            }

            const numerator = Math.pow(blocksSinceF64, 1.1) * lastBurnAmountSol;
            const dynamicPower = 2.2 * (1.0 - taxRateF64);
            const innerExp = Math.pow(blocksFromGenesisF64, dynamicPower) + Math.pow(33, 3);

            if (innerExp <= 1.0) {
                return 0;
            }

            const baseLog = Math.log(innerExp);
            const denominator = Math.pow(baseLog, 3.0);

            if (denominator <= 0.0 || !isFinite(denominator) || !isFinite(numerator)) {
                return 0;
            }

            const claimableRaw = numerator / denominator;

            if (claimableRaw < 0.0 || !isFinite(claimableRaw) || claimableRaw > 1e12) {
                return 0;
            }

            return claimableRaw;

        } catch (error) {
            return 0;
        }
    }
}

// Exposer la classe globalement
window.YMUtils = YMUtils;