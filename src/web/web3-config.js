window.YM_CONFIG = {
    NETWORK: 'https://api.devnet.solana.com',
    PROGRAM_ID: '6ue88JtUXzKN5yrFkauU85EHpg4aSsM9QfarvHBQS7TZ',
    CREATOR_ADDRESS: '7Cjt3kRF6FvQQ2XkfxcdsaU9hAZsz6odXWVaLUUhRLZ6',
    
    REFERENCE_GENESIS_SLOT: 111111111,
    
    TOKEN_METADATA: {
        name: 'YourMine',
        symbol: 'YRM', 
        decimals: 18,
        description: 'Democratic Deflationary Mining Token'
    },
    
    ALGORITHM: {
        max_tax_rate: 40,
        default_tax_rate: 20,
        power_blocks_since: 1.1,
        power_formula: 2.2,
        constant_33_cubed: Math.pow(33, 3),
        logarithm_power: 3
    },
    
    UI: {
        min_burn_amount: 0.0001,
        min_claimable: 0.000000000000000001,
        format_decimals: 5,
        notification_duration: 3000
    },
    
    PROGRAMS: {
        TOKEN: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
        ASSOCIATED_TOKEN: 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
        SYSTEM: '11111111111111111111111111111111',
        METADATA: 'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s'
    },
    
    DECIMALS: {
        SOL: 9,
        YRM: 18,
        SOL_MULTIPLIER: 1000000000,      
        YRM_MULTIPLIER: 1000000000000000000, 
        CONVERSION_MULTIPLIER: 1000000000    
    },
    
  
    HELPERS: {
        solToLamports: (sol) => Math.floor(sol * 1000000000),
        lamportsToSol: (lamports) => lamports / 1000000000,
        yrmUnitsToYrm: (units) => units / 1000000000000000000,
        yrmToUnits: (yrm) => Math.floor(yrm * 1000000000000000000),
        calculateYrmFromSol: (sol, taxRate) => {
            const afterTax = sol * (1 - taxRate / 100);
            return afterTax;
        }
    },
    
    YRM_DECIMALS_MULTIPLIER: 1000000000000000000,
};