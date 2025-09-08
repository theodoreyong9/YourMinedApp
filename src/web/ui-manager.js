/**
 * Gestionnaire d'interface utilisateur pour YourMine
 */

class UIManager {
    constructor() {
        this.elements = {};
        this.callbacks = {};
        this.initializeElements();
        this.setupEventListeners();
    }

    /**
     * Initialise les références aux éléments DOM
     */
    initializeElements() {
        this.elements = {
            // Boutons
            connectBtn: document.getElementById('connectBtn'),
            burnBtn: document.getElementById('burnBtn'),
            claimBtn: document.getElementById('claimBtn'),
            simulateBtn: document.getElementById('simulateBtn'),
            confirmBurnBtn: document.getElementById('confirmBurnBtn'),
            cancelBurnBtn: document.getElementById('cancelBurnBtn'),

            // Affichages de solde
            solBalance: document.getElementById('solBalance'),
            yrmBalance: document.getElementById('yrmBalance'),
            totalSupply: document.getElementById('totalSupply'),

            // Informations utilisateur
            lastActionDisplay: document.getElementById('lastActionDisplay'),
            taxRateDisplay: document.getElementById('taxRateDisplay'),
            lastBurnDisplay: document.getElementById('lastBurnDisplay'),

            // Simulateur
            blockInput: document.getElementById('blockInput'),
            claimableResult: document.getElementById('claimableResult'),

            // Dialog de burn
            burnDialog: document.getElementById('burnDialog'),
            burnAmount: document.getElementById('burnAmount'),
            taxSlider: document.getElementById('taxSlider'),
            taxValue: document.getElementById('taxValue'),
            solBalanceDisplay: document.getElementById('solBalanceDisplay'),

            // Aperçu de burn
            previewBurnAmount: document.getElementById('previewBurnAmount'),
            previewTaxRate: document.getElementById('previewTaxRate'),
            previewTaxAmount: document.getElementById('previewTaxAmount'),
            previewYrmAmount: document.getElementById('previewYrmAmount')
        };
    }

    /**
     * Configure les event listeners
     */
    setupEventListeners() {
        // Bouton de connexion
        this.elements.connectBtn.onclick = () => {
            if (this.callbacks.onConnectClick) {
                this.callbacks.onConnectClick();
            }
        };

        // Bouton de burn
        this.elements.burnBtn.onclick = () => {
            this.showBurnDialog();
        };

        // Bouton de claim
        this.elements.claimBtn.onclick = () => {
            if (this.callbacks.onClaim) {
                this.callbacks.onClaim();
            }
        };

        // Bouton de simulation
        this.elements.simulateBtn.onclick = () => {
            if (this.callbacks.onSimulate) {
                this.callbacks.onSimulate();
            }
        };

        // Dialog de burn
        this.elements.confirmBurnBtn.onclick = () => {
            this.executeBurn();
        };

        this.elements.cancelBurnBtn.onclick = () => {
            this.hideBurnDialog();
        };

        // Fermeture du dialog en cliquant à l'extérieur
        this.elements.burnDialog.onclick = (e) => {
            if (e.target === this.elements.burnDialog) {
                this.hideBurnDialog();
            }
        };

        // Slider de taxe
        this.elements.taxSlider.oninput = () => {
            this.updateTaxDisplay();
        };

        // Montant de burn
        this.elements.burnAmount.oninput = () => {
            this.updateBurnPreview();
        };

        // Input de simulation
        this.elements.blockInput.oninput = () => {
            if (this.callbacks.onSimulateInput) {
                this.callbacks.onSimulateInput();
            }
        };

        // Gestion du retour depuis mobile
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && this.callbacks.onVisibilityChange) {
                setTimeout(() => {
                    this.callbacks.onVisibilityChange();
                }, 1000);
            }
        });
    }

    /**
     * Met à jour l'état de connexion
     */
    updateConnectionState(isConnected, address = null) {
        if (isConnected) {
            this.elements.connectBtn.textContent = 'Connected';
            this.elements.connectBtn.classList.add('connected');
        } else {
            this.elements.connectBtn.textContent = '🚀 Connect';
            this.elements.connectBtn.classList.remove('connected');
        }
    }

    /**
     * Met à jour les soldes affichés
     */
    updateBalances(solBalance, yrmBalance, totalSupply) {
        this.elements.solBalance.textContent = YMUtils.formatNumber(solBalance, 6);
        this.elements.yrmBalance.textContent = YMUtils.formatNumber(yrmBalance, window.YM_CONFIG.UI.format_decimals);
        this.elements.totalSupply.textContent = YMUtils.formatNumber(totalSupply, window.YM_CONFIG.UI.format_decimals);
    }

    /**
     * Met à jour les informations utilisateur
     */
    updateUserInfo(lastActionSlot, taxRate, lastBurnAmount) {
        this.elements.lastActionDisplay.textContent = lastActionSlot || 'Genesis';
        this.elements.taxRateDisplay.textContent = taxRate;
        this.elements.lastBurnDisplay.textContent = 
            lastBurnAmount ? (lastBurnAmount / 1000000000).toFixed(6) : '0';
    }

    /**
     * Réinitialise les informations utilisateur
     */
    resetUserInfo() {
        this.elements.lastActionDisplay.textContent = '-';
        this.elements.taxRateDisplay.textContent = '-';
        this.elements.lastBurnDisplay.textContent = '-';
    }

    /**
     * Met à jour l'état des boutons
     */
    updateButtonStates(isConnected, solBalance, minBurnAmount) {
        if (isConnected) {
            this.elements.burnBtn.disabled = solBalance < minBurnAmount;
            this.elements.claimBtn.disabled = false;
        } else {
            this.elements.burnBtn.disabled = true;
            this.elements.claimBtn.disabled = true;
        }
    }

    /**
     * Met à jour le résultat de simulation
     */
    updateSimulationResult(claimableAmount, isConnected = true) {
        if (!isConnected) {
            this.elements.claimableResult.textContent = 'Connect wallet';
            return;
        }
        
        this.elements.claimableResult.textContent = 
            YMUtils.formatNumber(claimableAmount, window.YM_CONFIG.UI.format_decimals) + ' YRM';
    }

    /**
     * Met à jour l'input de slot
     */
    updateBlockInput(currentSlot) {
        this.elements.blockInput.value = currentSlot;
    }

    /**
     * Affiche le dialog de burn
     */
    showBurnDialog() {
        this.elements.burnDialog.classList.add('active');
        this.updateBurnPreview();
    }

    /**
     * Cache le dialog de burn
     */
    hideBurnDialog() {
        this.elements.burnDialog.classList.remove('active');
    }

    /**
     * Met à jour l'affichage de la taxe
     */
    updateTaxDisplay() {
        const tax = parseInt(this.elements.taxSlider.value);
        this.elements.taxValue.textContent = tax + '%';
        this.updateBurnPreview();
    }

    /**
     * Met à jour l'aperçu de burn
     */
    updateBurnPreview() {
        const burnAmount = parseFloat(this.elements.burnAmount.value) || 0;
        const taxRate = parseInt(this.elements.taxSlider.value);
        
        const taxAmount = burnAmount * (taxRate / 100);
        const yrmAmount = burnAmount * (1 - taxRate / 100);
        
        this.elements.previewBurnAmount.textContent = YMUtils.formatNumber(burnAmount, 6);
        this.elements.previewTaxRate.textContent = taxRate + '%';
        this.elements.previewTaxAmount.textContent = YMUtils.formatNumber(taxAmount, 6) + ' SOL';
        this.elements.previewYrmAmount.textContent = YMUtils.formatNumber(yrmAmount, window.YM_CONFIG.UI.format_decimals) + ' YRM';
    }

    /**
     * Met à jour l'affichage du solde SOL dans le dialog
     */
    updateSolBalanceDisplay(solBalance) {
        this.elements.solBalanceDisplay.textContent = YMUtils.formatNumber(solBalance, 6);
    }

    /**
     * Exécute le burn
     */
    executeBurn() {
        const burnAmount = parseFloat(this.elements.burnAmount.value);
        const taxRate = parseInt(this.elements.taxSlider.value);
        
        if (this.callbacks.onBurn) {
            this.callbacks.onBurn(burnAmount, taxRate);
        }
    }

    /**
     * Obtient les valeurs actuelles du dialog de burn
     */
    getBurnDialogValues() {
        return {
            burnAmount: parseFloat(this.elements.burnAmount.value) || 0,
            taxRate: parseInt(this.elements.taxSlider.value) || 20
        };
    }

    /**
     * Obtient la valeur actuelle de l'input de simulation
     */
    getSimulationSlot() {
        return parseInt(this.elements.blockInput.value) || 0;
    }

    /**
     * Définit les callbacks pour les événements
     */
    setCallbacks(callbacks) {
        this.callbacks = { ...this.callbacks, ...callbacks };
    }

    /**
     * Ajoute un callback
     */
    addCallback(event, callback) {
        this.callbacks[event] = callback;
    }

    /**
     * Supprime un callback
     */
    removeCallback(event) {
        delete this.callbacks[event];
    }
}

// Exposer la classe globalement
window.UIManager = UIManager;