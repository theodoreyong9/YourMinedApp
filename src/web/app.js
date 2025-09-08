/**
 * Classe principale de l'application YourMine
 */

class YourMineApp {
    constructor() {
        this.connection = null;
        this.walletManager = null;
        this.uiManager = null;
        this.realtimeManager = null;
        
        // PDAs
        this.globalStatePda = null;
        this.yrmMintPda = null;
        this.solVaultPda = null;
        this.userAccountPda = null;
        this.userTokenAccountPda = null;
        
        // État de l'application
        this.appState = {
            connected: false,
            walletAddress: null,
            solBalance: 0,
            yrmBalance: 0,
            lastActionSlot: 0,
            currentSlot: 0,
            taxRate: 20,
            totalBurned: 0,
            lastBurnAmount: 0,
            claimableAmount: 0,
            programInitialized: false,
            programGenesisSlot: 111111111,
            totalSupply: 0
        };
        
        this.init();
    }

    /**
     * Initialise l'application
     */
    async init() {
        try {
            // Initialiser la connexion Solana
            this.connection = new solanaWeb3.Connection(window.YM_CONFIG.NETWORK, 'confirmed');
            
            // Calculer les PDAs
            await this.calculatePDAs();
            
            // Initialiser les gestionnaires
            this.walletManager = new WalletManager();
            this.uiManager = new UIManager();
            this.realtimeManager = new RealtimeUpdatesManager(this.connection);
            
            // Configurer les callbacks
            this.setupCallbacks();
            
            // Charger les données initiales
            await this.loadInitialData();
            
            // Vérifier les connexions existantes
            await this.walletManager.checkExistingConnection();
            await this.walletManager.checkMobileReturn();
            
            // Mettre à jour l'interface
            this.updateUI();
            
        } catch (error) {
            console.error("Erreur d'initialisation:", error);
            YMUtils.showNotification('Erreur d\'initialisation de l\'application', 'error');
        }
    }

    /**
     * Calcule les PDAs
     */
    async calculatePDAs() {
        try {
            const pdas = await YMUtils.calculatePDAs(window.YM_CONFIG.PROGRAM_ID);
            this.globalStatePda = pdas.globalStatePda;
            this.yrmMintPda = pdas.yrmMintPda;
            this.solVaultPda = pdas.solVaultPda;
        } catch (error) {
            console.error("Erreur lors du calcul des PDAs:", error);
        }
    }

    /**
     * Configure les callbacks entre les gestionnaires
     */
    setupCallbacks() {
        // Callbacks du wallet
        this.walletManager.onConnect(async (publicKey) => {
            await this.onWalletConnected(publicKey);
        });

        this.walletManager.onDisconnect(async () => {
            await this.onWalletDisconnected();
        });

        // Callbacks de l'UI
        this.uiManager.setCallbacks({
            onConnectClick: () => this.handleConnectClick(),
            onBurn: (amount, taxRate) => this.executeBurn(amount, taxRate),
            onClaim: () => this.executeClaim(),
            onSimulate: () => this.getCurrentSlot(),
            onSimulateInput: () => this.simulateClaimable(),
            onVisibilityChange: () => this.handleVisibilityChange()
        });

        // Callbacks des mises à jour en temps réel
        this.realtimeManager.onUpdate((updates) => {
            this.handleRealtimeUpdates(updates);
        });
    }

    /**
     * Charge les données initiales
     */
    async loadInitialData() {
        try {
            // Charger la supply totale
            this.appState.totalSupply = await SolanaHelpers.getTotalSupply(
                this.connection, 
                this.yrmMintPda
            );

            // Obtenir le slot actuel
            this.appState.currentSlot = await this.connection.getSlot();
            this.uiManager.updateBlockInput(this.appState.currentSlot);

        } catch (error) {
            console.error("Erreur lors du chargement des données initiales:", error);
        }
    }

    /**
     * Gère le clic sur le bouton de connexion
     */
    async handleConnectClick() {
        if (this.walletManager.getIsConnected()) {
            await this.walletManager.disconnect();
        } else {
            await this.walletManager.connect();
        }
    }

    /**
     * Gère la connexion du wallet
     */
    async onWalletConnected(publicKey) {
        try {
            this.appState.connected = true;
            this.appState.walletAddress = publicKey.toString();

            // Calculer les PDAs utilisateur
            const userPDAs = await YMUtils.calculateUserPDAs(
                publicKey, 
                this.yrmMintPda, 
                window.YM_CONFIG.PROGRAM_ID
            );
            this.userAccountPda = userPDAs.userAccountPda;
            this.userTokenAccountPda = userPDAs.userTokenAccountPda;

            // Charger les données utilisateur
            await this.loadUserData();

            // Démarrer les mises à jour en temps réel
            this.startRealtimeUpdates();

            // Mettre à jour l'interface
            this.uiManager.updateConnectionState(true, this.appState.walletAddress);
            this.updateUI();

        } catch (error) {
            console.error("Erreur lors de la connexion:", error);
            YMUtils.showNotification('Erreur lors de la connexion du wallet', 'error');
        }
    }

    /**
     * Gère la déconnexion du wallet
     */
    async onWalletDisconnected() {
        // Arrêter les mises à jour en temps réel
        this.realtimeManager.stop();

        // Réinitialiser l'état
        this.appState.connected = false;
        this.appState.walletAddress = null;
        this.appState.solBalance = 0;
        this.appState.yrmBalance = 0;
        this.appState.lastActionSlot = 0;
        this.appState.taxRate = 20;
        this.appState.totalBurned = 0;
        this.appState.lastBurnAmount = 0;
        this.appState.claimableAmount = 0;

        this.userAccountPda = null;
        this.userTokenAccountPda = null;

        // Mettre à jour l'interface
        this.uiManager.updateConnectionState(false);
        this.uiManager.resetUserInfo();
        this.updateUI();
    }

    /**
     * Charge les données utilisateur
     */
    async loadUserData() {
        if (!this.appState.connected) return;

        try {
            const publicKey = this.walletManager.getPublicKey();

            // Charger les soldes
            this.appState.solBalance = await SolanaHelpers.getSOLBalance(this.connection, publicKey);
            this.appState.yrmBalance = await SolanaHelpers.getYRMBalance(
                this.connection, 
                this.userTokenAccountPda[0]
            );

            // Charger les données utilisateur
            try {
                const accountInfo = await this.connection.getAccountInfo(this.userAccountPda[0]);
                if (accountInfo && accountInfo.data) {
                    const userData = YMUtils.parseUserAccountData(accountInfo.data);
                    this.appState.lastActionSlot = userData.lastActionSlot;
                    this.appState.taxRate = userData.taxRate;
                    this.appState.totalBurned = userData.totalBurned;
                    this.appState.lastBurnAmount = userData.lastBurnAmount;
                } else {
                    // Compte utilisateur n'existe pas encore
                    this.appState.lastActionSlot = 0;
                    this.appState.taxRate = window.YM_CONFIG.ALGORITHM.default_tax_rate;
                    this.appState.totalBurned = 0;
                    this.appState.lastBurnAmount = 0;
                }
            } catch (error) {
                // Compte utilisateur n'existe pas
            }

            // Vérifier si le programme est initialisé
            this.appState.programInitialized = await SolanaHelpers.isProgramInitialized(
                this.connection, 
                this.globalStatePda
            );

            if (this.appState.programInitialized) {
                this.appState.programGenesisSlot = await SolanaHelpers.getProgramGenesisSlot(
                    this.connection, 
                    this.globalStatePda
                );
            }

            // Calculer le montant récupérable
            this.calculateClaimable();

            // Mettre à jour l'interface
            this.uiManager.updateUserInfo(
                this.appState.lastActionSlot,
                this.appState.taxRate,
                this.appState.lastBurnAmount
            );

        } catch (error) {
            console.error("Erreur lors du chargement des données utilisateur:", error);
        }
    }

    /**
     * Démarre les mises à jour en temps réel
     */
    startRealtimeUpdates() {
        if (!this.appState.connected || !this.userTokenAccountPda) {
            return;
        }

        const accounts = {
            userPublicKey: this.walletManager.getPublicKey(),
            userTokenAccount: this.userTokenAccountPda[0],
            userAccount: this.userAccountPda[0],
            yrmMint: this.yrmMintPda
        };

        this.realtimeManager.start(accounts);
    }

    /**
     * Gère les mises à jour en temps réel
     */
    handleRealtimeUpdates(updates) {
        let hasUpdates = false;

        if (updates.solBalance !== undefined) {
            this.appState.solBalance = updates.solBalance;
            hasUpdates = true;
        }

        if (updates.yrmBalance !== undefined) {
            this.appState.yrmBalance = updates.yrmBalance;
            hasUpdates = true;
        }

        if (updates.userData) {
            this.appState.lastActionSlot = updates.userData.lastActionSlot;
            this.appState.taxRate = updates.userData.taxRate;
            this.appState.totalBurned = updates.userData.totalBurned;
            this.appState.lastBurnAmount = updates.userData.lastBurnAmount;
            
            this.uiManager.updateUserInfo(
                this.appState.lastActionSlot,
                this.appState.taxRate,
                this.appState.lastBurnAmount
            );
            hasUpdates = true;
        }

        if (updates.totalSupply !== undefined) {
            this.appState.totalSupply = updates.totalSupply;
            hasUpdates = true;
        }

        if (hasUpdates) {
            this.calculateClaimable();
            this.updateUI();
        }
    }

    /**
     * Gère le changement de visibilité de la page
     */
    async handleVisibilityChange() {
        if (this.appState.connected) {
            await this.walletManager.checkMobileReturn();
            await this.refreshData();
        }
    }

    /**
     * Rafraîchit toutes les données
     */
    async refreshData() {
        try {
            this.appState.currentSlot = await this.connection.getSlot();
            await this.loadUserData();
            this.appState.totalSupply = await SolanaHelpers.getTotalSupply(
                this.connection, 
                this.yrmMintPda
            );
            
            this.uiManager.updateBlockInput(this.appState.currentSlot);
            this.simulateClaimable();
            this.updateUI();
        } catch (error) {
            console.error("Erreur lors du rafraîchissement:", error);
        }
    }

    /**
     * Calcule le montant récupérable
     */
    calculateClaimable() {
        this.appState.claimableAmount = YMUtils.calculateClaimable(
            this.appState.lastBurnAmount,
            this.appState.lastActionSlot,
            this.appState.currentSlot,
            this.appState.taxRate
        );
    }

    /**
     * Simule le montant récupérable pour un slot donné
     */
    simulateClaimable() {
        const targetSlot = this.uiManager.getSimulationSlot();
        
        if (!this.appState.connected) {
            this.uiManager.updateSimulationResult(0, false);
            return;
        }

        const simulatedClaimable = YMUtils.calculateClaimable(
            this.appState.lastBurnAmount,
            this.appState.lastActionSlot,
            targetSlot,
            this.appState.taxRate
        );

        this.uiManager.updateSimulationResult(simulatedClaimable, true);
    }

    /**
     * Obtient le slot actuel
     */
    async getCurrentSlot() {
        try {
            const currentSlot = await this.connection.getSlot();
            this.appState.currentSlot = currentSlot;
            this.uiManager.updateBlockInput(currentSlot);
            this.simulateClaimable();
            this.calculateClaimable();
            this.updateUI();
            YMUtils.showNotification(`Current slot: ${currentSlot}`, 'info');
        } catch (error) {
            YMUtils.showNotification('Failed to get current slot', 'error');
        }
    }

    /**
     * Exécute une transaction de burn
     */
    async executeBurn(burnAmount, taxRate) {
        if (!this.appState.connected) {
            YMUtils.showNotification('Please connect your wallet first', 'error');
            return;
        }

        if (!burnAmount || burnAmount <= 0) {
            YMUtils.showNotification('Please enter a valid burn amount', 'error');
            return;
        }
        
        if (burnAmount > this.appState.solBalance) {
            YMUtils.showNotification('Insufficient SOL balance', 'error');
            return;
        }

        if (burnAmount < window.YM_CONFIG.UI.min_burn_amount) {
            YMUtils.showNotification(`Minimum burn amount is ${window.YM_CONFIG.UI.min_burn_amount} SOL`, 'error');
            return;
        }

        try {
            // Vérifier si le programme est initialisé
            if (!this.appState.programInitialized) {
                await this.initializeProgram();
            }

            YMUtils.showNotification('Processing burn transaction...', 'info');

            const creatorPubkey = new solanaWeb3.PublicKey(window.YM_CONFIG.CREATOR_ADDRESS);
            
            // Créer la transaction
            const transaction = await SolanaHelpers.createBurnTransaction(
                this.walletManager.getPublicKey(),
                this.globalStatePda,
                this.userAccountPda[0],
                this.yrmMintPda,
                this.userTokenAccountPda[0],
                this.solVaultPda,
                creatorPubkey,
                burnAmount,
                taxRate,
                this.connection
            );

            // Signer et envoyer
            const signature = await this.walletManager.signAndSendTransaction(transaction);
            await this.connection.confirmTransaction(signature, 'confirmed');
            
            this.uiManager.hideBurnDialog();
            
            setTimeout(async () => {
                await this.refreshData();
                YMUtils.showNotification(`Successfully burned ${YMUtils.formatNumber(burnAmount)} SOL!`, 'success');
            }, 1500);
            
        } catch (error) {
            this.handleTransactionError(error, 'Burn');
        }
    }

    /**
     * Initialise le programme
     */
    async initializeProgram() {
        YMUtils.showNotification('Initializing YourMine protocol...', 'info');
        
        const transaction = await SolanaHelpers.createInitTransaction(
            this.walletManager.getPublicKey(),
            this.globalStatePda,
            this.yrmMintPda,
            this.connection
        );
        
        const signature = await this.walletManager.signAndSendTransaction(transaction);
        await this.connection.confirmTransaction(signature, 'confirmed');
        
        this.appState.programInitialized = true;
        YMUtils.showNotification('Protocol initialized!', 'success');
        
        await new Promise(resolve => setTimeout(resolve, 2000));
    }

    /**
     * Exécute une transaction de claim
     */
    async executeClaim() {
        if (!this.appState.connected) {
            YMUtils.showNotification('Please connect your wallet first', 'error');
            return;
        }

        this.appState.currentSlot = await this.connection.getSlot();
        this.calculateClaimable();
        
        if (this.appState.claimableAmount <= 0) {
            YMUtils.showNotification('No claimable amount available. Burn SOL first or wait for more blocks.', 'info');
            return;
        }

        try {
            YMUtils.showNotification('Processing claim...', 'info');
            
            const transaction = await SolanaHelpers.createClaimTransaction(
                this.walletManager.getPublicKey(),
                this.globalStatePda,
                this.userAccountPda[0],
                this.yrmMintPda,
                this.userTokenAccountPda[0],
                this.connection
            );
            
            const signature = await this.walletManager.signAndSendTransaction(transaction);
            await this.connection.confirmTransaction(signature, 'confirmed');
            
            setTimeout(async () => {
                await this.refreshData();
                YMUtils.showNotification(`Successfully claimed ${YMUtils.formatNumber(this.appState.claimableAmount)} YRM!`, 'success');
            }, 1500);
            
        } catch (error) {
            this.handleTransactionError(error, 'Claim');
        }
    }

    /**
     * Gère les erreurs de transaction
     */
    handleTransactionError(error, action) {
        let errorMessage = `${action} failed`;
        
        if (error.message) {
            if (error.message.includes('Transaction cancelled by user')) {
                errorMessage = `${action} cancelled by user`;
            } else if (error.message.includes('insufficient funds')) {
                errorMessage = 'Insufficient funds for transaction';
            } else {
                errorMessage = `${action} failed: ${error.message.substring(0, 100)}`;
            }
        }
        
        YMUtils.showNotification(errorMessage, 'error');
    }

    /**
     * Met à jour l'interface utilisateur
     */
    updateUI() {
        this.uiManager.updateBalances(
            this.appState.solBalance,
            this.appState.yrmBalance,
            this.appState.totalSupply
        );

        this.uiManager.updateButtonStates(
            this.appState.connected,
            this.appState.solBalance,
            window.YM_CONFIG.UI.min_burn_amount
        );

        this.uiManager.updateSolBalanceDisplay(this.appState.solBalance);
    }
}

// Initialiser l'application au chargement de la page
document.addEventListener('DOMContentLoaded', function() {
    window.yourMineApp = new YourMineApp();
});
