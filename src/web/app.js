class YourMineApp {
    constructor() {
        this.connection = null;
        this.wallet = null;
        this.program = null;
        this.userPublicKey = null;
        this.userAccountPda = null;
        this.userTokenAccountPda = null;
        
        this.globalStatePda = null;
        this.yrmMintPda = null;
        this.solVaultPda = null;
        
        this.wsConnection = null;
        this.balanceInterval = null;
        this.subscriptionIds = new Map();
        
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
            burnAmount: 1,
            claimableAmount: 0,
            programInitialized: false,
            programGenesisSlot: 111111111,
            totalSupply: 0
        };
        
        this.connectWallet = this.connectWallet.bind(this);
        this.disconnectWallet = this.disconnectWallet.bind(this);
        
        this.init();
    }

    async init() {
        this.connection = new solanaWeb3.Connection(window.YM_CONFIG.NETWORK, 'confirmed');
        await this.calculatePDAs();
        this.setupEventListeners();
        this.updateUI();
        await this.checkExistingConnection();
        await this.checkMobileReturn();
        await this.loadTotalSupply();
    }

    async calculatePDAs() {
        try {
            const programId = new solanaWeb3.PublicKey(window.YM_CONFIG.PROGRAM_ID);
            
            const [globalStatePda] = await solanaWeb3.PublicKey.findProgramAddress(
                [new TextEncoder().encode('global_state')],
                programId
            );
            this.globalStatePda = globalStatePda;
            
            const [yrmMintPda] = await solanaWeb3.PublicKey.findProgramAddress(
                [new TextEncoder().encode('yrm_mint')],
                programId
            );
            this.yrmMintPda = yrmMintPda;
            
            const [solVaultPda] = await solanaWeb3.PublicKey.findProgramAddress(
                [new TextEncoder().encode('sol_vault')],
                programId
            );
            this.solVaultPda = solVaultPda;
            
        } catch (error) {
            console.error("Error calculating PDAs:", error);
        }
    }

    async loadTotalSupply() {
        try {
            if (!this.yrmMintPda) return;

            const mintAccountInfo = await this.connection.getAccountInfo(this.yrmMintPda);
            if (mintAccountInfo && mintAccountInfo.data) {
                const data = mintAccountInfo.data;
                const view = new DataView(data.buffer);
                const supply = view.getBigUint64(36, true);
                this.appState.totalSupply = Number(supply) / window.YM_CONFIG.YRM_DECIMALS_MULTIPLIER;
                this.updateUI();
            } else {
                this.appState.totalSupply = 0;
            }
        } catch (error) {
            this.appState.totalSupply = 0;
        }
    }

    setupEventListeners() {
        document.getElementById('connectBtn').onclick = () => this.handleConnectClick();
        document.getElementById('burnBtn').onclick = () => this.showBurnDialog();
        document.getElementById('cancelBurnBtn').onclick = () => this.hideBurnDialog();
        document.getElementById('confirmBurnBtn').onclick = () => this.executeBurn();
        document.getElementById('claimBtn').onclick = () => this.claimAction();
        document.getElementById('blockInput').oninput = () => this.simulateClaimable();
        
        document.getElementById('simulateBtn').onclick = () => this.getCurrentSlot();
        
        document.getElementById('taxSlider').oninput = () => this.updateTaxDisplay();
        document.getElementById('burnAmount').oninput = () => this.updateBurnPreview();
        
        document.getElementById('burnDialog').onclick = (e) => {
            if (e.target === document.getElementById('burnDialog')) {
                this.hideBurnDialog();
            }
        };

        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && this.appState.connected) {
                setTimeout(() => {
                    this.checkMobileReturn();
                    this.refreshBalances();
                }, 1000);
            }
        });
    }
    
    setupRealtimeUpdates() {
        this.cleanupRealtimeUpdates();
        
        if (!this.appState.connected || !this.userTokenAccountPda) {
            return;
        }
        
        this.setupWebSocketUpdates().catch(() => {
            this.setupPollingUpdates();
        });
    }
    
    async setupWebSocketUpdates() {
        return new Promise((resolve, reject) => {
            try {
                const wsUrl = window.YM_CONFIG.NETWORK.replace('https://', 'wss://');
                this.wsConnection = new WebSocket(wsUrl);
                
                let connectionTimeout = setTimeout(() => {
                    this.wsConnection?.close();
                    reject(new Error("WebSocket connection timeout"));
                }, 5000);
                
                this.wsConnection.onopen = () => {
                    clearTimeout(connectionTimeout);
                    
                    this.subscribeToAccount(this.userTokenAccountPda[0], 'token');
                    this.subscribeToAccount(this.userPublicKey, 'sol');
                    this.subscribeToAccount(this.userAccountPda[0], 'user');
                    this.subscribeToAccount(this.yrmMintPda, 'mint');
                    
                    resolve();
                };
                
                this.wsConnection.onmessage = (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        this.handleWebSocketMessage(data);
                    } catch (error) {
                        // Silent error
                    }
                };
                
                this.wsConnection.onerror = (error) => {
                    clearTimeout(connectionTimeout);
                    reject(error);
                };
                
                this.wsConnection.onclose = () => {
                    this.setupPollingUpdates();
                };
                
            } catch (error) {
                reject(error);
            }
        });
    }
    
    subscribeToAccount(publicKey, type) {
        const id = Math.floor(Math.random() * 10000);
        this.subscriptionIds.set(id, type);
        
        this.wsConnection.send(JSON.stringify({
            jsonrpc: "2.0",
            id: id,
            method: "accountSubscribe",
            params: [
                publicKey.toString(),
                { 
                    commitment: "confirmed",
                    encoding: "base64"
                }
            ]
        }));
    }
    
    handleWebSocketMessage(data) {
        if (data.method === "accountNotification") {
            const subscriptionType = this.subscriptionIds.get(data.params.subscription);
            const accountData = data.params.result;
            
            switch (subscriptionType) {
                case 'token':
                    this.handleTokenAccountUpdate(accountData);
                    break;
                case 'sol':
                    this.handleSolAccountUpdate(accountData);
                    break;
                case 'user':
                    this.handleUserAccountUpdate(accountData);
                    break;
                case 'mint':
                    this.handleMintAccountUpdate(accountData);
                    break;
            }
        }
    }
    
    handleTokenAccountUpdate(accountData) {
        if (accountData?.value?.data?.[0]) {
            try {
                const buffer = Buffer.from(accountData.value.data[0], 'base64');
                const view = new DataView(buffer.buffer);
                const balance = view.getBigUint64(64, true);
                const newYrmBalance = Number(balance) / window.YM_CONFIG.YRM_DECIMALS_MULTIPLIER;
                
                if (Math.abs(newYrmBalance - this.appState.yrmBalance) > 0.000001) {
                    this.appState.yrmBalance = newYrmBalance;
                    this.calculateClaimable();
                    this.updateUI();
                }
            } catch (error) {
                // Silent error
            }
        }
    }
    
    handleSolAccountUpdate(accountData) {
        if (accountData?.value?.lamports !== undefined) {
            const newSolBalance = accountData.value.lamports / solanaWeb3.LAMPORTS_PER_SOL;
            
            if (Math.abs(newSolBalance - this.appState.solBalance) > 0.00001) {
                this.appState.solBalance = newSolBalance;
                this.updateUI();
            }
        }
    }
    
    handleUserAccountUpdate(accountData) {
        if (accountData?.value?.data?.[0]) {
            try {
                const buffer = Buffer.from(accountData.value.data[0], 'base64');
                this.parseUserAccountDataFromBuffer(buffer);
                this.updateUserInfoDisplay();
                this.calculateClaimable();
                this.updateUI();
            } catch (error) {
                // Silent error
            }
        }
    }
    
    handleMintAccountUpdate(accountData) {
        if (accountData?.value?.data?.[0]) {
            try {
                const buffer = Buffer.from(accountData.value.data[0], 'base64');
                const view = new DataView(buffer.buffer);
                const supply = view.getBigUint64(36, true);
                const newTotalSupply = Number(supply) / window.YM_CONFIG.YRM_DECIMALS_MULTIPLIER;
                
                if (Math.abs(newTotalSupply - this.appState.totalSupply) > 0.000001) {
                    this.appState.totalSupply = newTotalSupply;
                    this.updateUI();
                }
            } catch (error) {
                // Silent error
            }
        }
    }
    
    setupPollingUpdates() {
        if (this.balanceInterval) {
            clearInterval(this.balanceInterval);
        }
        
        this.balanceInterval = setInterval(async () => {
            if (this.appState.connected) {
                try {
                    let updated = false;
                    
                    const solBalance = await this.connection.getBalance(this.userPublicKey);
                    const newSolBalance = solBalance / solanaWeb3.LAMPORTS_PER_SOL;
                    
                    if (Math.abs(newSolBalance - this.appState.solBalance) > 0.00001) {
                        this.appState.solBalance = newSolBalance;
                        updated = true;
                    }
                    
                    const tokenAccountInfo = await this.connection.getAccountInfo(this.userTokenAccountPda[0]);
                    let newYrmBalance = 0;
                    if (tokenAccountInfo?.data) {
                        const view = new DataView(tokenAccountInfo.data.buffer);
                        const balance = view.getBigUint64(64, true);
                        newYrmBalance = Number(balance) / window.YM_CONFIG.YRM_DECIMALS_MULTIPLIER;
                    }
                    
                    if (Math.abs(newYrmBalance - this.appState.yrmBalance) > 0.000001) {
                        this.appState.yrmBalance = newYrmBalance;
                        updated = true;
                    }
                    
                    const userAccountInfo = await this.connection.getAccountInfo(this.userAccountPda[0]);
                    if (userAccountInfo?.data) {
                        const oldTaxRate = this.appState.taxRate;
                        const oldLastAction = this.appState.lastActionSlot;
                        const oldLastBurn = this.appState.lastBurnAmount;
                        
                        await this.parseUserAccountData(userAccountInfo.data);
                        
                        if (oldTaxRate !== this.appState.taxRate || 
                            oldLastAction !== this.appState.lastActionSlot ||
                            oldLastBurn !== this.appState.lastBurnAmount) {
                            this.updateUserInfoDisplay();
                            updated = true;
                        }
                    }
                    
                    const mintAccountInfo = await this.connection.getAccountInfo(this.yrmMintPda);
                    if (mintAccountInfo?.data) {
                        const view = new DataView(mintAccountInfo.data.buffer);
                        const supply = view.getBigUint64(36, true);
                        const newTotalSupply = Number(supply) / window.YM_CONFIG.YRM_DECIMALS_MULTIPLIER;
                        
                        if (Math.abs(newTotalSupply - this.appState.totalSupply) > 0.000001) {
                            this.appState.totalSupply = newTotalSupply;
                            updated = true;
                        }
                    }
                    
                    if (updated) {
                        this.calculateClaimable();
                        this.updateUI();
                    }
                    
                } catch (error) {
                    // Silent error
                }
            }
        }, 3000);
    }
    
    cleanupRealtimeUpdates() {
        if (this.wsConnection) {
            try {
                for (const [id, type] of this.subscriptionIds) {
                    this.wsConnection.send(JSON.stringify({
                        jsonrpc: "2.0",
                        id: id,
                        method: "accountUnsubscribe",
                        params: [id]
                    }));
                }
                
                this.wsConnection.close();
            } catch (error) {
                // Silent error
            }
            this.wsConnection = null;
        }
        
        this.subscriptionIds.clear();
        
        if (this.balanceInterval) {
            clearInterval(this.balanceInterval);
            this.balanceInterval = null;
        }
    }

    async checkExistingConnection() {
        if (window.solana && window.solana.isPhantom) {
            try {
                const response = await window.solana.connect({ onlyIfTrusted: true });
                if (response.publicKey) {
                    await this.onWalletConnected(response.publicKey);
                }
            } catch (error) {
                // No existing connection
            }
        }
    }

    async checkMobileReturn() {
        if (this.isMobileDevice() && window.solana && window.solana.isConnected && window.solana.publicKey) {
            await this.onWalletConnected(window.solana.publicKey);
        }
    }

    async handleConnectClick() {
        if (this.appState.connected) {
            await this.disconnectWallet();
        } else {
            await this.connectWallet();
        }
    }

    async connectWallet() {
        if (!window.solana) {
            if (this.isMobileDevice()) {
                const deepLink = this.createPhantomDeepLink();
                this.showNotification('Opening Phantom wallet...', 'info');
                window.location.href = deepLink;
                return;
            } else {
                this.showNotification('Please install Phantom wallet', 'error');
                window.open('https://phantom.app/', '_blank');
                return;
            }
        }
        
        try {
            this.showNotification('Connecting to wallet...', 'info');
            
            if (!window.solana.isConnected) {
                if (window.solana.isGlow) {
                    await window.solana.connect({
                        onlyIfTrusted: false,
                        commitment: 'confirmed'
                    });
                } else {
                    await window.solana.connect({
                        onlyIfTrusted: false
                    });
                }
            }
            
            if (!window.solana.publicKey) {
                await window.solana.connect();
            }
            
            await this.onWalletConnected(window.solana.publicKey);
            
        } catch (err) {
            this.showNotification('Failed to connect to wallet', 'error');
        }
    }

    async disconnectWallet() {
        try {
            if (window.solana && window.solana.isConnected) {
                await window.solana.disconnect();
            }
            await this.disconnect();
        } catch (error) {
            await this.disconnect();
        }
    }

    isMobileDevice() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }

    createPhantomDeepLink() {
        const currentURL = `${window.location.origin}${window.location.pathname}`;
        const encodedURL = encodeURIComponent(currentURL);
        const refURL = encodeURIComponent(window.location.origin);
        
        return `https://phantom.app/ul/browse/${encodedURL}?ref=${refURL}`;
    }

    async onWalletConnected(publicKey) {
        this.userPublicKey = publicKey;
        this.appState.connected = true;
        this.appState.walletAddress = publicKey.toString();
        
        const seeds = [
            new TextEncoder().encode('user_account'),
            publicKey.toBytes()
        ];

        this.userAccountPda = await solanaWeb3.PublicKey.findProgramAddress(
            seeds,
            new solanaWeb3.PublicKey(window.YM_CONFIG.PROGRAM_ID)
        );

        this.userTokenAccountPda = await solanaWeb3.PublicKey.findProgramAddress(
            [
                this.userPublicKey.toBuffer(),
                new solanaWeb3.PublicKey(window.YM_CONFIG.PROGRAMS.TOKEN).toBuffer(),
                this.yrmMintPda.toBuffer(),
            ],
            new solanaWeb3.PublicKey(window.YM_CONFIG.PROGRAMS.ASSOCIATED_TOKEN)
        );

        document.getElementById('connectBtn').textContent = 'Connected';
        document.getElementById('connectBtn').classList.add('connected');
        
        await this.loadUserData();
        
        this.setupRealtimeUpdates();
        
        this.showNotification('Wallet connected successfully!', 'success');
    }

    async disconnect() {
        this.cleanupRealtimeUpdates();
        
        this.appState.connected = false;
        this.appState.walletAddress = null;
        this.appState.solBalance = 0;
        this.appState.yrmBalance = 0;
        this.appState.lastActionSlot = 0;
        this.appState.taxRate = 20;
        this.appState.totalBurned = 0;
        this.appState.lastBurnAmount = 0;
        this.userPublicKey = null;
        this.userAccountPda = null;
        this.userTokenAccountPda = null;
        
        document.getElementById('connectBtn').textContent = 'Connect';
        document.getElementById('connectBtn').classList.remove('connected');
        
        this.updateUserInfoDisplay();
        
        this.updateUI();
        this.showNotification('Wallet disconnected', 'info');
    }

    async loadUserData() {
        if (!this.appState.connected) return;

        try {
            const solBalance = await this.connection.getBalance(this.userPublicKey);
            this.appState.solBalance = solBalance / solanaWeb3.LAMPORTS_PER_SOL;

            this.appState.currentSlot = await this.connection.getSlot();

            const globalStateInfo = await this.connection.getAccountInfo(this.globalStatePda);
            this.appState.programInitialized = !!globalStateInfo;
            
            if (globalStateInfo && globalStateInfo.data) {
                try {
                    const view = new DataView(globalStateInfo.data.buffer);
                    let offset = 8;
                    offset += 32;
                    offset += 8;
                    offset += 8;
                    this.appState.programGenesisSlot = Number(view.getBigUint64(offset, true));
                } catch (error) {
                    this.appState.programGenesisSlot = window.YM_CONFIG.REFERENCE_GENESIS_SLOT;
                }
            } else {
                this.appState.programGenesisSlot = window.YM_CONFIG.REFERENCE_GENESIS_SLOT;
            }

            await this.loadYRMBalance();
            await this.loadTotalSupply();

            try {
                const accountInfo = await this.connection.getAccountInfo(this.userAccountPda[0]);
                if (accountInfo && accountInfo.data) {
                    await this.parseUserAccountData(accountInfo.data);
                } else {
                    this.appState.lastActionSlot = 0;
                    this.appState.taxRate = window.YM_CONFIG.ALGORITHM.default_tax_rate;
                    this.appState.totalBurned = 0;
                    this.appState.lastBurnAmount = 0;
                }
            } catch (error) {
                this.appState.lastActionSlot = 0;
                this.appState.totalBurned = 0;
                this.appState.lastBurnAmount = 0;
            }

            document.getElementById('blockInput').value = this.appState.currentSlot;

            this.updateUserInfoDisplay();
            this.calculateClaimable();
            this.simulateClaimable();
            this.updateUI();
            
        } catch (error) {
            this.showNotification('Error loading account data', 'error');
        }
    }

    updateUserInfoDisplay() {
        if (this.appState.connected) {
            document.getElementById('lastActionDisplay').textContent = 
                this.appState.lastActionSlot || 'Genesis';
            document.getElementById('taxRateDisplay').textContent = this.appState.taxRate;
            
            const lastBurnElement = document.getElementById('lastBurnDisplay');
            if (lastBurnElement) {
                lastBurnElement.textContent = 
                    this.appState.lastBurnAmount ? (this.appState.lastBurnAmount / 1000000000).toFixed(6) : '0';
            }
            
            const lastSlotElement = document.getElementById('lastSlotDisplay');
            if (lastSlotElement) {
                lastSlotElement.textContent = this.appState.lastActionSlot || '-';
            }
        } else {
            document.getElementById('lastActionDisplay').textContent = '-';
            document.getElementById('taxRateDisplay').textContent = '-';
            
            const lastBurnElement = document.getElementById('lastBurnDisplay');
            if (lastBurnElement) lastBurnElement.textContent = '-';
            
            const lastSlotElement = document.getElementById('lastSlotDisplay');
            if (lastSlotElement) lastSlotElement.textContent = '-';
        }
    }

    async loadYRMBalance() {
        try {
            if (!this.userTokenAccountPda) return;

            const tokenAccountInfo = await this.connection.getAccountInfo(this.userTokenAccountPda[0]);
            if (tokenAccountInfo && tokenAccountInfo.data) {
                const data = tokenAccountInfo.data;
                const view = new DataView(data.buffer);
                const balance = view.getBigUint64(64, true);
                this.appState.yrmBalance = Number(balance) / window.YM_CONFIG.YRM_DECIMALS_MULTIPLIER;
            } else {
                this.appState.yrmBalance = 0;
            }
        } catch (error) {
            this.appState.yrmBalance = 0;
        }
    }

    async parseUserAccountData(data) {
        try {
            if (data.length < 65) return;
            
            const view = new DataView(data.buffer);
            let offset = 8;
            offset += 32;
            
            this.appState.taxRate = view.getUint8(offset);
            offset += 1;
            
            this.appState.lastActionSlot = Number(view.getBigUint64(offset, true));
            offset += 8;
            
            this.appState.totalBurned = Number(view.getBigUint64(offset, true));
            offset += 8;
            
            this.appState.lastBurnAmount = Number(view.getBigUint64(offset, true));
            
        } catch (error) {
            this.appState.lastActionSlot = 0;
            this.appState.taxRate = window.YM_CONFIG.ALGORITHM.default_tax_rate;
            this.appState.totalBurned = 0;
            this.appState.lastBurnAmount = 0;
        }
    }
    
    parseUserAccountDataFromBuffer(buffer) {
        try {
            if (buffer.length < 65) return;
            
            const view = new DataView(buffer);
            let offset = 8;
            offset += 32;
            
            this.appState.taxRate = view.getUint8(offset);
            offset += 1;
            
            this.appState.lastActionSlot = Number(view.getBigUint64(offset, true));
            offset += 8;
            
            this.appState.totalBurned = Number(view.getBigUint64(offset, true));
            offset += 8;
            
            this.appState.lastBurnAmount = Number(view.getBigUint64(offset, true));
            
        } catch (error) {
            // Keep existing values
        }
    }

    calculateClaimable() {
        try {
            if (this.appState.lastBurnAmount === 0) {
                this.appState.claimableAmount = 0;
                return;
            }

            if (this.appState.lastActionSlot === 0) {
                this.appState.claimableAmount = 0;
                return;
            }

            if (!this.appState.currentSlot || this.appState.currentSlot <= this.appState.lastActionSlot) {
                this.appState.claimableAmount = 0;
                return;
            }

            const blocksSinceAction = Math.max(1, this.appState.currentSlot - this.appState.lastActionSlot);
            const blocksFromGenesis = Math.max(1, this.appState.currentSlot - window.YM_CONFIG.REFERENCE_GENESIS_SLOT);

            if (blocksSinceAction < 30) {
                this.appState.claimableAmount = 0;
                return;
            }

            const blocksSinceF64 = parseFloat(blocksSinceAction);
            const blocksFromGenesisF64 = parseFloat(blocksFromGenesis);
            const lastBurnAmountSol = this.appState.lastBurnAmount / 1000000000.0;
            const taxRateF64 = Math.min(this.appState.taxRate, 40) / 100.0;

            if (!isFinite(blocksSinceF64) || !isFinite(blocksFromGenesisF64) || !isFinite(lastBurnAmountSol)) {
                this.appState.claimableAmount = 0;
                return;
            }

            const numerator = Math.pow(blocksSinceF64, 1.1) * lastBurnAmountSol;
            const dynamicPower = 2.2 * (1.0 - taxRateF64);
            const innerExp = Math.pow(blocksFromGenesisF64, dynamicPower) + Math.pow(33, 3);

            if (innerExp <= 1.0) {
                this.appState.claimableAmount = 0;
                return;
            }

            const baseLog = Math.log(innerExp);
            const denominator = Math.pow(baseLog, 3.0);

            if (denominator <= 0.0 || !isFinite(denominator) || !isFinite(numerator)) {
                this.appState.claimableAmount = 0;
                return;
            }

            const claimableRaw = numerator / denominator;

            if (claimableRaw < 0.0 || !isFinite(claimableRaw)) {
                this.appState.claimableAmount = 0;
                return;
            }

            if (claimableRaw > 1e12) {
                this.appState.claimableAmount = 0;
                return;
            }

            this.appState.claimableAmount = claimableRaw;

        } catch (error) {
            this.appState.claimableAmount = 0;
        }
    }

    serializeBurnInstruction(solAmount, taxRate) {
        const buffer = new ArrayBuffer(17);
        const view = new DataView(buffer);
        
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

    serializeClaimInstruction() {
        const buffer = new ArrayBuffer(8);
        const discriminator = new Uint8Array([62, 198, 214, 193, 213, 159, 108, 210]);
        
        const uint8Array = new Uint8Array(buffer);
        for (let i = 0; i < 8; i++) {
            uint8Array[i] = discriminator[i];
        }
        
        return uint8Array;
    }

    showBurnDialog() {
        if (!this.appState.connected) {
            this.showNotification('Please connect your wallet first', 'error');
            return;
        }
        
        document.getElementById('burnDialog').classList.add('active');
        this.updateBurnPreview();
        document.getElementById('solBalanceDisplay').textContent = this.formatNumber(this.appState.solBalance, 6);
    }

    hideBurnDialog() {
        document.getElementById('burnDialog').classList.remove('active');
    }

    updateTaxDisplay() {
        const taxSlider = document.getElementById('taxSlider');
        const taxValue = document.getElementById('taxValue');
        
        const tax = parseInt(taxSlider.value);
        this.appState.taxRate = tax;
        
        taxValue.textContent = tax + '%';
        document.getElementById('solBalanceDisplay').textContent = this.formatNumber(this.appState.solBalance, 6);
        
        this.updateBurnPreview();
    }

    updateBurnPreview() {
        const burnAmount = parseFloat(document.getElementById('burnAmount').value) || 0;
        const taxRate = parseInt(document.getElementById('taxSlider').value);
        
        const taxAmount = burnAmount * (taxRate / 100);
        const yrmAmount = burnAmount * (1 - taxRate / 100);
        
        document.getElementById('previewBurnAmount').textContent = this.formatNumber(burnAmount, 6);
        document.getElementById('previewTaxRate').textContent = taxRate + '%';
        document.getElementById('previewTaxAmount').textContent = this.formatNumber(taxAmount, 6) + ' SOL';
        document.getElementById('previewYrmAmount').textContent = this.formatNumber(yrmAmount, window.YM_CONFIG.UI.format_decimals) + ' YRM';
        
        document.getElementById('solBalanceDisplay').textContent = this.formatNumber(this.appState.solBalance, 6);
    }

    async executeBurn() {
        const burnAmount = parseFloat(document.getElementById('burnAmount').value);
        const taxRate = parseInt(document.getElementById('taxSlider').value);
        
        if (!burnAmount || burnAmount <= 0) {
            this.showNotification('Please enter a valid burn amount', 'error');
            return;
        }
        
        if (burnAmount > this.appState.solBalance) {
            this.showNotification('Insufficient SOL balance', 'error');
            return;
        }

        if (burnAmount < window.YM_CONFIG.UI.min_burn_amount) {
            this.showNotification(`Minimum burn amount is ${window.YM_CONFIG.UI.min_burn_amount} SOL`, 'error');
            return;
        }

        try {
            const globalStateInfo = await this.connection.getAccountInfo(this.globalStatePda);
            this.appState.programInitialized = !!globalStateInfo;
            
            if (!this.appState.programInitialized) {
                this.showNotification('Initializing YourMine protocol...', 'info');
                
                const initTx = new solanaWeb3.Transaction();
                const initDiscriminator = new Uint8Array([175, 175, 109, 31, 13, 152, 155, 237]);
                
                const initInstruction = new solanaWeb3.TransactionInstruction({
                    keys: [
                        { pubkey: this.globalStatePda, isSigner: false, isWritable: true },
                        { pubkey: this.yrmMintPda, isSigner: false, isWritable: true },
                        { pubkey: this.userPublicKey, isSigner: true, isWritable: true },
                        { pubkey: new solanaWeb3.PublicKey(window.YM_CONFIG.PROGRAMS.TOKEN), isSigner: false, isWritable: false },
                        { pubkey: solanaWeb3.SystemProgram.programId, isSigner: false, isWritable: false },
                    ],
                    programId: new solanaWeb3.PublicKey(window.YM_CONFIG.PROGRAM_ID),
                    data: initDiscriminator
                });
                
                initTx.add(initInstruction);
                initTx.feePayer = this.userPublicKey;
                
                const { blockhash: initBlockhash } = await this.connection.getLatestBlockhash('confirmed');
                initTx.recentBlockhash = initBlockhash;
                
                let initSignature;
                try {
                    initSignature = await window.solana.signAndSendTransaction(initTx);
                    await this.connection.confirmTransaction(initSignature, 'confirmed');
                    
                    this.appState.programInitialized = true;
                    this.showNotification('Protocol initialized!', 'success');
                    
                    await new Promise(resolve => setTimeout(resolve, 2000));
                } catch (initError) {
                    if (initError.message && initError.message.includes('User rejected')) {
                        this.showNotification('Initialization cancelled by user', 'info');
                        return;
                    } else {
                        throw initError;
                    }
                }
            }
            
            this.showNotification('Processing burn transaction...', 'info');
            
            const creatorPubkey = new solanaWeb3.PublicKey(window.YM_CONFIG.CREATOR_ADDRESS);
            
            if (globalStateInfo && globalStateInfo.data) {
                try {
                    const view = new DataView(globalStateInfo.data.buffer);
                    let offset = 8;
                    
                    const creatorBytes = new Uint8Array(globalStateInfo.data.buffer, offset, 32);
                    const storedCreatorPubkey = new solanaWeb3.PublicKey(creatorBytes);
                    
                    if (!storedCreatorPubkey.equals(creatorPubkey)) {
                        this.showNotification('Creator address mismatch - check configuration', 'error');
                        return;
                    }
                } catch (error) {
                    // Continue with burn
                }
            }
            
            const burnAmountLamports = Math.floor(burnAmount * solanaWeb3.LAMPORTS_PER_SOL);
            const taxAmountLamports = Math.floor(burnAmountLamports * (taxRate / 100));
            const vaultAmountLamports = burnAmountLamports - taxAmountLamports;
            
            const userBalanceBefore = await this.connection.getBalance(this.userPublicKey);
            const creatorBalanceBefore = await this.connection.getBalance(creatorPubkey);
            
            if (userBalanceBefore < burnAmountLamports + 10000) {
                this.showNotification('Insufficient SOL balance for burn + transaction fees', 'error');
                return;
            }
            
            const burnTx = new solanaWeb3.Transaction();
            const instructionData = this.serializeBurnInstruction(burnAmountLamports, taxRate);

            const burnInstruction = new solanaWeb3.TransactionInstruction({
                keys: [
                    { pubkey: this.globalStatePda, isSigner: false, isWritable: true },
                    { pubkey: this.userAccountPda[0], isSigner: false, isWritable: true },
                    { pubkey: this.yrmMintPda, isSigner: false, isWritable: true },
                    { pubkey: this.userTokenAccountPda[0], isSigner: false, isWritable: true },
                    { pubkey: this.solVaultPda, isSigner: false, isWritable: true },
                    { pubkey: creatorPubkey, isSigner: false, isWritable: true },
                    { pubkey: this.userPublicKey, isSigner: true, isWritable: true },
                    { pubkey: new solanaWeb3.PublicKey(window.YM_CONFIG.PROGRAMS.TOKEN), isSigner: false, isWritable: false },
                    { pubkey: new solanaWeb3.PublicKey(window.YM_CONFIG.PROGRAMS.ASSOCIATED_TOKEN), isSigner: false, isWritable: false },
                    { pubkey: solanaWeb3.SystemProgram.programId, isSigner: false, isWritable: false },
                ],
                programId: new solanaWeb3.PublicKey(window.YM_CONFIG.PROGRAM_ID),
                data: instructionData
            });
            
            burnTx.add(burnInstruction);
            burnTx.feePayer = this.userPublicKey;
            
            const { blockhash } = await this.connection.getLatestBlockhash('confirmed');
            burnTx.recentBlockhash = blockhash;

            let burnSignature;
            try {
                burnSignature = await window.solana.signAndSendTransaction(burnTx);
            } catch (signError) {
                if (signError.message && signError.message.includes('User rejected')) {
                    this.showNotification('Transaction cancelled by user', 'info');
                    return;
                } else if (signError.message && signError.message.includes('insufficient funds')) {
                    this.showNotification('Insufficient funds for transaction fees', 'error');
                    return;
                } else {
                    throw signError;
                }
            }
            
            await this.connection.confirmTransaction(burnSignature, 'confirmed');
            
            this.hideBurnDialog();
            
            setTimeout(async () => {
                await this.refreshBalances();
                this.showNotification(`Successfully burned ${this.formatNumber(burnAmount)} SOL! Tax: ${this.formatNumber(taxAmountLamports / 1e9)} SOL sent to creator`, 'success');
            }, 1500);
            
        } catch (error) {
            let errorMessage = 'Transaction failed';
            
            if (error.message) {
                if (error.message.includes('User rejected')) {
                    errorMessage = 'Transaction cancelled by user';
                } else if (error.message.includes('insufficient funds')) {
                    errorMessage = 'Insufficient funds for transaction';
                } else if (error.message.includes('Invalid creator address')) {
                    errorMessage = 'Invalid creator address configuration';
                } else if (error.message.includes('0x1')) {
                    errorMessage = 'Account not found or invalid';
                } else if (error.message.includes('0x0')) {
                    errorMessage = 'Transaction simulation failed';
                } else {
                    errorMessage = `Transaction failed: ${error.message.substring(0, 100)}`;
                }
            }
            
            this.showNotification(errorMessage, 'error');
        }
    }

    async claimAction() {
        if (!this.appState.connected) {
            this.showNotification('Please connect your wallet first', 'error');
            return;
        }

        this.appState.currentSlot = await this.connection.getSlot();
        await this.loadYRMBalance();
        
        try {
            const accountInfo = await this.connection.getAccountInfo(this.userAccountPda[0]);
            if (accountInfo && accountInfo.data) {
                await this.parseUserAccountData(accountInfo.data);
            }
        } catch (error) {
            // User account doesn't exist yet
        }
        
        this.calculateClaimable();
        
        if (this.appState.claimableAmount <= 0) {
            this.showNotification('No claimable amount available. Burn SOL first or wait for more blocks to accumulate rewards.', 'info');
            return;
        }

        try {
            this.showNotification('Processing claim...', 'info');
            
            const transaction = await this.createClaimTransaction();
            
            let signature;
            try {
                signature = await window.solana.signAndSendTransaction(transaction);
            } catch (signError) {
                if (signError.message && signError.message.includes('User rejected')) {
                    this.showNotification('Claim cancelled by user', 'info');
                    return;
                } else {
                    throw signError;
                }
            }
            
            await this.connection.confirmTransaction(signature, 'confirmed');
            
            setTimeout(async () => {
                await this.refreshBalances();
                this.showNotification(`Successfully claimed ${this.formatNumber(this.appState.claimableAmount)} YRM!`, 'success');
            }, 1500);
            
        } catch (error) {
            let errorMessage = 'Claim failed';
            
            if (error.message) {
                if (error.message.includes('User rejected')) {
                    errorMessage = 'Claim cancelled by user';
                } else if (error.message.includes('Nothing to claim')) {
                    errorMessage = 'Nothing to claim at the moment';
                } else {
                    errorMessage = `Claim failed: ${error.message.substring(0, 100)}`;
                }
            }
            
            this.showNotification(errorMessage, 'error');
        }
    }

    async createClaimTransaction() {
        const transaction = new solanaWeb3.Transaction();
        const instructionData = this.serializeClaimInstruction();
        
        const instruction = new solanaWeb3.TransactionInstruction({
            keys: [
                { pubkey: this.globalStatePda, isSigner: false, isWritable: true },
                { pubkey: this.userAccountPda[0], isSigner: false, isWritable: true },
                { pubkey: this.yrmMintPda, isSigner: false, isWritable: true },
                { pubkey: this.userTokenAccountPda[0], isSigner: false, isWritable: true },
                { pubkey: this.userPublicKey, isSigner: true, isWritable: false },
                { pubkey: new solanaWeb3.PublicKey(window.YM_CONFIG.PROGRAMS.TOKEN), isSigner: false, isWritable: false },
            ],
            programId: new solanaWeb3.PublicKey(window.YM_CONFIG.PROGRAM_ID),
            data: instructionData
        });
        
        transaction.add(instruction);
        transaction.feePayer = this.userPublicKey;
        
        const { blockhash } = await this.connection.getLatestBlockhash('confirmed');
        transaction.recentBlockhash = blockhash;
        
        return transaction;
    }

    simulateClaimable() {
        const blockInput = document.getElementById('blockInput');
        const claimableResult = document.getElementById('claimableResult');
        
        const targetSlot = parseInt(blockInput.value);
        
        if (!this.appState.connected) {
            claimableResult.textContent = 'Connect wallet';
            return;
        }
        
        if (!targetSlot || this.appState.lastBurnAmount === 0) {
            claimableResult.textContent = '0 YRM';
            return;
        }
        
        if (this.appState.lastActionSlot === 0) {
            claimableResult.textContent = '0 YRM (no previous action)';
            return;
        }
        
        if (targetSlot <= this.appState.lastActionSlot) {
            claimableResult.textContent = '0 YRM (no time elapsed)';
            return;
        }
        
        const blocksSinceAction = Math.max(1, targetSlot - this.appState.lastActionSlot);
        const blocksFromGenesis = Math.max(1, targetSlot - window.YM_CONFIG.REFERENCE_GENESIS_SLOT);
        
        if (blocksSinceAction < 30) {
            claimableResult.textContent = `0 YRM (need ${30 - blocksSinceAction} more blocks)`;
            return;
        }
        
        try {
            const blocksSinceF64 = parseFloat(blocksSinceAction);
            const blocksFromGenesisF64 = parseFloat(blocksFromGenesis);
            const lastBurnAmountSol = this.appState.lastBurnAmount / 1000000000.0;
            const taxRateF64 = Math.min(this.appState.taxRate, 40) / 100.0;

            const numerator = Math.pow(blocksSinceF64, 1.1) * lastBurnAmountSol;
            const dynamicPower = 2.2 * (1.0 - taxRateF64);
            const innerExp = Math.pow(blocksFromGenesisF64, dynamicPower) + Math.pow(33, 3);
            
            if (innerExp <= 1.0) {
                claimableResult.textContent = '0 YRM (calculation error)';
                return;
            }
            
            const baseLog = Math.log(innerExp);
            const denominator = Math.pow(baseLog, 3.0);
            
            if (denominator <= 0.0 || !isFinite(denominator) || !isFinite(numerator)) {
                claimableResult.textContent = '0 YRM (calculation error)';
                return;
            }
            
            const claimableRaw = numerator / denominator;
            
            if (claimableRaw < 0.0 || !isFinite(claimableRaw) || claimableRaw > 1e12) {
                claimableResult.textContent = '0 YRM (calculation error)';
                return;
            }

            const claimableYrm = claimableRaw;
            
            claimableResult.textContent = this.formatNumber(claimableYrm, window.YM_CONFIG.UI.format_decimals) + ' YRM';
            
        } catch (error) {
            claimableResult.textContent = '0 YRM (error)';
        }
    }

    async getCurrentSlot() {
        try {
            const currentSlot = await this.connection.getSlot();
            this.appState.currentSlot = currentSlot;
            document.getElementById('blockInput').value = currentSlot;
            this.simulateClaimable();
            this.calculateClaimable();
            this.updateUI();
            this.showNotification(`Current slot: ${currentSlot}`, 'info');
        } catch (error) {
            this.showNotification('Failed to get current slot', 'error');
        }
    }

    async refreshBalances() {
        try {
            this.appState.currentSlot = await this.connection.getSlot();
            
            const solBalance = await this.connection.getBalance(this.userPublicKey);
            this.appState.solBalance = solBalance / solanaWeb3.LAMPORTS_PER_SOL;
            
            await this.loadYRMBalance();
            await this.loadTotalSupply();
            
            try {
                const accountInfo = await this.connection.getAccountInfo(this.userAccountPda[0]);
                if (accountInfo && accountInfo.data) {
                    await this.parseUserAccountData(accountInfo.data);
                } else {
                    this.appState.lastActionSlot = 0;
                    this.appState.taxRate = window.YM_CONFIG.ALGORITHM.default_tax_rate;
                    this.appState.totalBurned = 0;
                    this.appState.lastBurnAmount = 0;
                }
            } catch (error) {
                // Account doesn't exist
            }
            
            this.updateUserInfoDisplay();
            this.calculateClaimable();
            
            document.getElementById('blockInput').value = this.appState.currentSlot;
            this.simulateClaimable();
            this.updateUI();
            
        } catch (error) {
            // Silent error
        }
    }

    updateUI() {
        document.getElementById('solBalance').textContent = this.formatNumber(this.appState.solBalance, 6);
        document.getElementById('yrmBalance').textContent = this.formatNumber(this.appState.yrmBalance, window.YM_CONFIG.UI.format_decimals);
        document.getElementById('totalSupply').textContent = this.formatNumber(this.appState.totalSupply, window.YM_CONFIG.UI.format_decimals);
        
        const burnBtn = document.getElementById('burnBtn');
        const claimBtn = document.getElementById('claimBtn');
        
        if (this.appState.connected) {
            burnBtn.disabled = this.appState.solBalance < window.YM_CONFIG.UI.min_burn_amount;
            claimBtn.disabled = false;
        } else {
            burnBtn.disabled = true;
            claimBtn.disabled = true;
        }
    }

    formatNumber(num, decimals = window.YM_CONFIG.UI.format_decimals) {
        if (num === 0) return '0';
        if (num < 0.00000000001 && num > 0) return '< 0.00000000001';
        return parseFloat(num.toFixed(decimals)).toString();
    }

    showNotification(message, type = 'info') {
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
}

document.addEventListener('DOMContentLoaded', function() {
    window.yourMineApp = new YourMineApp();
});