use anchor_lang::prelude::*; 
use anchor_lang::system_program;
use anchor_spl::token::{self, Token, TokenAccount, Mint, MintTo, Transfer};
use anchor_spl::associated_token::AssociatedToken;
use std::str::FromStr;

declare_id!("6ue88JtUXzKN5yrFkauU85EHpg4aSsM9QfarvHBQS7TZ");

const DECIMAL_MULTIPLIER: u64 = 1_000_000_000;
const REFERENCE_GENESIS_SLOT: u64 = 111111111;

#[program]
pub mod yourmine {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let global_state = &mut ctx.accounts.global_state;
        
        global_state.creator = Pubkey::from_str("7Cjt3kRF6FvQQ2XkfxcdsaU9hAZsz6odXWVaLUUhRLZ6")
            .map_err(|_| ErrorCode::InvalidCreatorAddress)?;
        global_state.total_sol_burned = 0;
        global_state.total_yrm_minted = 0;
        global_state.genesis_slot = Clock::get()?.slot;
        global_state.yrm_mint = ctx.accounts.yrm_mint.key();
        global_state.bump = ctx.bumps.global_state;
        
        msg!("YourMine initialized! Genesis slot: {}", global_state.genesis_slot);
        msg!("YRM Token Mint: {}", ctx.accounts.yrm_mint.key());
        msg!("Creator set to: {}", global_state.creator);
        Ok(())
    }

    pub fn burn_and_mint(
        ctx: Context<BurnAndMint>,
        sol_amount: u64,
        tax_rate: u8,
    ) -> Result<()> {
        require!(tax_rate <= 40, ErrorCode::TaxRateTooHigh);
        require!(sol_amount > 0, ErrorCode::InvalidAmount);

        let global_state = &mut ctx.accounts.global_state;
        let user_account = &mut ctx.accounts.user_account;
        let current_slot = Clock::get()?.slot;

        msg!("Starting burn_and_mint: sol_amount={}, tax_rate={}", sol_amount, tax_rate);
        msg!("Creator from global_state: {}", global_state.creator);
        msg!("Creator from accounts: {}", ctx.accounts.creator.key());

        require!(
            ctx.accounts.creator.key() == global_state.creator,
            ErrorCode::CreatorAddressMismatch
        );

        if user_account.last_action_slot > 0 && user_account.last_burn_amount > 0 {
            msg!("Checking auto-claim: last_action={}, last_burn={}", user_account.last_action_slot, user_account.last_burn_amount);
            
            let claimable = calculate_claimable(
                current_slot,
                user_account.last_action_slot,
                user_account.last_burn_amount,
                user_account.tax_rate,
                global_state.genesis_slot,
            )?;

            if claimable > 0 {
                msg!("Auto-claiming {} YRM units", claimable);
                
                let seeds = &[b"global_state".as_ref(), &[global_state.bump]];
                let signer = &[&seeds[..]];
                
                let cpi_accounts = MintTo {
                    mint: ctx.accounts.yrm_mint.to_account_info(),
                    to: ctx.accounts.user_token_account.to_account_info(),
                    authority: global_state.to_account_info(),
                };
                let cpi_program = ctx.accounts.token_program.to_account_info();
                let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);

                token::mint_to(cpi_ctx, claimable)?;
                
                global_state.total_yrm_minted = global_state.total_yrm_minted
                    .checked_add(claimable)
                    .ok_or(ErrorCode::Overflow)?;

                msg!("✅ Auto-claimed: {} YRM units successfully", claimable);
            } else {
                msg!("No claimable amount (need more time or higher burn amount)");
            }
        } else {
            msg!("No auto-claim: first burn or no previous burn amount");
        }

        let tax_amount = sol_amount
            .checked_mul(tax_rate as u64)
            .ok_or(ErrorCode::Overflow)?
            .checked_div(100)
            .ok_or(ErrorCode::DivisionByZero)?;

        let vault_amount = sol_amount
            .checked_sub(tax_amount)
            .ok_or(ErrorCode::Underflow)?;

        msg!("Tax calculation: total={}, tax={}, vault={}", sol_amount, tax_amount, vault_amount);

        if tax_amount > 0 {
            msg!("=== TRANSFERRING TAX TO CREATOR ===");
            msg!("Tax amount: {} lamports ({} SOL)", tax_amount, tax_amount as f64 / 1_000_000_000.0);
            msg!("From user: {}", ctx.accounts.user.key());
            msg!("To creator: {}", ctx.accounts.creator.key());
            msg!("User balance before: {} lamports", ctx.accounts.user.lamports());
            msg!("Creator balance before: {} lamports", ctx.accounts.creator.lamports());
            
            let ix_tax = system_program::Transfer {
                from: ctx.accounts.user.to_account_info(),
                to: ctx.accounts.creator.to_account_info(),
            };
            let cpi_context_tax = CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                ix_tax,
            );
            
            match system_program::transfer(cpi_context_tax, tax_amount) {
                Ok(()) => {
                    msg!("✅ Tax transfer successful!");
                    msg!("User balance after: {} lamports", ctx.accounts.user.lamports());
                    msg!("Creator balance after: {} lamports", ctx.accounts.creator.lamports());
                },
                Err(e) => {
                    msg!("❌ Tax transfer failed: {:?}", e);
                    return Err(e);
                }
            }
        } else {
            msg!("No tax to transfer (tax_amount = 0)");
        }

        if vault_amount > 0 {
            msg!("Transferring {} lamports to vault (burn)", vault_amount);
            
            let ix_vault = system_program::Transfer {
                from: ctx.accounts.user.to_account_info(),
                to: ctx.accounts.program_sol_account.to_account_info(),
            };
            let cpi_context_vault = CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                ix_vault,
            );
            system_program::transfer(cpi_context_vault, vault_amount)?;
            msg!("✅ Vault transfer successful: {} lamports", vault_amount);
        }

        let yrm_amount = vault_amount
            .checked_mul(DECIMAL_MULTIPLIER)
            .ok_or(ErrorCode::Overflow)?;

        msg!("Minting {} YRM units", yrm_amount);

        let seeds = &[b"global_state".as_ref(), &[global_state.bump]];
        let signer = &[&seeds[..]];
        
        let cpi_accounts = MintTo {
            mint: ctx.accounts.yrm_mint.to_account_info(),
            to: ctx.accounts.user_token_account.to_account_info(),
            authority: global_state.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);

        token::mint_to(cpi_ctx, yrm_amount)?;
        
        user_account.owner = ctx.accounts.user.key();
        user_account.tax_rate = tax_rate;
        user_account.last_action_slot = current_slot;
        user_account.total_burned = user_account.total_burned
            .checked_add(sol_amount)
            .ok_or(ErrorCode::Overflow)?;
        user_account.last_burn_amount = sol_amount;

        global_state.total_sol_burned = global_state.total_sol_burned
            .checked_add(sol_amount)
            .ok_or(ErrorCode::Overflow)?;
        global_state.total_yrm_minted = global_state.total_yrm_minted
            .checked_add(yrm_amount)
            .ok_or(ErrorCode::Overflow)?;

        emit!(BurnEvent {
            user: ctx.accounts.user.key(),
            sol_burned: sol_amount,
            yrm_received: yrm_amount,
            tax_rate,
            tax_amount,
            vault_amount,
            slot: current_slot,
        });

        msg!(
            "✅ BURN COMPLETE: {} SOL → {} YRM (tax={}%, {}/{} SOL)",
            sol_amount as f64 / 1_000_000_000.0,
            yrm_amount as f64 / 1_000_000_000_000_000_000.0,
            tax_rate,
            tax_amount as f64 / 1_000_000_000.0,
            vault_amount as f64 / 1_000_000_000.0
        );

        Ok(())
    }

    pub fn claim(ctx: Context<Claim>) -> Result<()> {
        let global_state = &mut ctx.accounts.global_state;
        let user_account = &mut ctx.accounts.user_account;
        let current_slot = Clock::get()?.slot;

        require!(user_account.owner != Pubkey::default(), ErrorCode::UserAccountNotInitialized);

        let effective_last_action = if user_account.last_action_slot == 0 {
            global_state.genesis_slot
        } else {
            user_account.last_action_slot
        };

        let claimable = calculate_claimable(
            current_slot,
            effective_last_action,
            user_account.last_burn_amount,
            user_account.tax_rate,
            global_state.genesis_slot,
        )?;

        require!(claimable > 0, ErrorCode::NothingToClaim);

        let seeds = &[b"global_state".as_ref(), &[global_state.bump]];
        let signer = &[&seeds[..]];
        
        let cpi_accounts = MintTo {
            mint: ctx.accounts.yrm_mint.to_account_info(),
            to: ctx.accounts.user_token_account.to_account_info(),
            authority: global_state.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);

        token::mint_to(cpi_ctx, claimable)?;
        
        global_state.total_yrm_minted = global_state.total_yrm_minted
            .checked_add(claimable)
            .ok_or(ErrorCode::Overflow)?;
        
        user_account.last_action_slot = current_slot;

        emit!(ClaimEvent {
            user: ctx.accounts.user.key(),
            yrm_claimed: claimable,
            slot: current_slot,
        });

        msg!("✅ CLAIM SUCCESSFUL: {} YRM units", claimable);
        Ok(())
    }

    pub fn transfer_yrm(
        ctx: Context<TransferYrm>,
        amount: u64,
    ) -> Result<()> {
        require!(amount > 0, ErrorCode::InvalidAmount);
        
        let from_account = &mut ctx.accounts.from_account;
        let current_slot = Clock::get()?.slot;

        require!(
            ctx.accounts.from_token_account.amount >= amount,
            ErrorCode::InsufficientBalance
        );

        let cpi_accounts = Transfer {
            from: ctx.accounts.from_token_account.to_account_info(),
            to: ctx.accounts.to_token_account.to_account_info(),
            authority: ctx.accounts.from.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);

        token::transfer(cpi_ctx, amount)?;

        from_account.last_action_slot = current_slot;
        
        if ctx.accounts.to_account.owner == Pubkey::default() {
            let to_account = &mut ctx.accounts.to_account;
            to_account.owner = ctx.accounts.to.key();
            to_account.tax_rate = 20;
            to_account.last_action_slot = current_slot;
            to_account.total_burned = 0;
            to_account.last_burn_amount = 0;
        } else {
            ctx.accounts.to_account.last_action_slot = current_slot;
        }

        emit!(TransferEvent {
            from: ctx.accounts.from.key(),
            to: ctx.accounts.to.key(),
            amount,
            slot: current_slot,
        });

        msg!("✅ TRANSFER: {} YRM units", amount);
        Ok(())
    }

    pub fn get_stats(ctx: Context<GetStats>) -> Result<()> {
        let global_state = &ctx.accounts.global_state;
        
        msg!("=== YourMine Stats ===");
        msg!("YRM Mint: {}", global_state.yrm_mint);
        msg!("Total SOL burned: {} ({} SOL)", global_state.total_sol_burned, global_state.total_sol_burned as f64 / 1_000_000_000.0);
        msg!("Total YRM minted: {} ({} YRM)", global_state.total_yrm_minted, global_state.total_yrm_minted as f64 / 1_000_000_000_000_000_000.0);
        msg!("Genesis slot: {}", global_state.genesis_slot);
        msg!("Creator: {}", global_state.creator);
        
        Ok(())
    }
}

fn calculate_claimable(
    current_slot: u64,
    last_action_slot: u64,
    last_burn_amount: u64,
    tax_rate: u8,
    genesis_slot: u64,
) -> Result<u64> {
    if last_burn_amount == 0 {
        return Ok(0);
    }

    let effective_last_action = if last_action_slot == 0 {
        genesis_slot
    } else {
        last_action_slot
    };

    if current_slot <= effective_last_action {
        return Ok(0);
    }

    let blocks_since_action = current_slot.saturating_sub(effective_last_action);
    
    if blocks_since_action < 30 {
        msg!("Not enough blocks elapsed: {} (minimum: 30)", blocks_since_action);
        return Ok(0);
    }

    let blocks_from_genesis = current_slot.saturating_sub(REFERENCE_GENESIS_SLOT).max(1);

    let blocks_since_f64 = blocks_since_action as f64;
    let blocks_from_genesis_f64 = blocks_from_genesis as f64;
    let last_burn_amount_sol = last_burn_amount as f64 / 1_000_000_000.0;
    let tax_rate_f64 = (tax_rate as f64).min(40.0) / 100.0;

    let numerator = blocks_since_f64.powf(1.1) * last_burn_amount_sol;
    
    let dynamic_power = 2.2 * (1.0 - tax_rate_f64);
    let inner_exp = blocks_from_genesis_f64.powf(dynamic_power) + (33_f64.powi(3));
    
    if inner_exp <= 1.0 {
        msg!("Inner expression too small for logarithm: {}", inner_exp);
        return Ok(0);
    }
    
    let base_log = inner_exp.ln();
    let denominator = base_log.powf(3.0);

    if denominator <= 0.0 || !denominator.is_finite() || !numerator.is_finite() {
        msg!("Invalid calculation: num={}, denom={}", numerator, denominator);
        return Ok(0);
    }

    let claimable_raw = numerator / denominator;
    
    if claimable_raw < 0.0 || !claimable_raw.is_finite() {
        msg!("Invalid result: {}", claimable_raw);
        return Ok(0);
    }

    let claimable_f64 = claimable_raw * 1_000_000_000_000_000_000.0;
    
    if claimable_f64 > (u64::MAX as f64) {
        msg!("Result too large: {}", claimable_f64);
        return Ok(0);
    }

    let claimable = claimable_f64.floor() as u64;
    
    msg!("CLAIM CALC: blocks_since={}, blocks_from_gen={}, last_burn_SOL={}, tax_rate={}, dynamic_power={}, raw={}, final_units={}",
         blocks_since_action, blocks_from_genesis, last_burn_amount_sol, tax_rate, dynamic_power, claimable_raw, claimable);
    
    Ok(claimable)
}

#[account]
pub struct GlobalState {
    pub creator: Pubkey,
    pub total_sol_burned: u64,
    pub total_yrm_minted: u64,
    pub genesis_slot: u64,
    pub yrm_mint: Pubkey,
    pub bump: u8,
}

#[account]
pub struct UserAccount {
    pub owner: Pubkey,
    pub tax_rate: u8,
    pub last_action_slot: u64,
    pub total_burned: u64,
    pub last_burn_amount: u64,
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = payer,
        space = 8 + 32 + 8 + 8 + 8 + 32 + 1,
        seeds = [b"global_state"],
        bump
    )]
    pub global_state: Account<'info, GlobalState>,
    
    #[account(
        init,
        payer = payer,
        mint::decimals = 18,
        mint::authority = global_state,
        seeds = [b"yrm_mint"],
        bump
    )]
    pub yrm_mint: Account<'info, Mint>,

    #[account(mut)]
    pub payer: Signer<'info>,
    
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct BurnAndMint<'info> {
    #[account(
        mut,
        seeds = [b"global_state"],
        bump = global_state.bump
    )]
    pub global_state: Account<'info, GlobalState>,

    #[account(
        init_if_needed,
        payer = user,
        space = 8 + 32 + 1 + 8 + 8 + 8,
        seeds = [b"user_account", user.key().as_ref()],
        bump
    )]
    pub user_account: Account<'info, UserAccount>,

    #[account(
        mut,
        seeds = [b"yrm_mint"],
        bump
    )]
    pub yrm_mint: Account<'info, Mint>,

    #[account(
        init_if_needed,
        payer = user,
        associated_token::mint = yrm_mint,
        associated_token::authority = user
    )]
    pub user_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [b"sol_vault"],
        bump
    )]
    pub program_sol_account: AccountInfo<'info>,

    #[account(
        mut,
        address = global_state.creator
    )]
    pub creator: AccountInfo<'info>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Claim<'info> {
    #[account(
        mut,
        seeds = [b"global_state"],
        bump = global_state.bump
    )]
    pub global_state: Account<'info, GlobalState>,

    #[account(
        mut,
        seeds = [b"user_account", user.key().as_ref()],
        bump
    )]
    pub user_account: Account<'info, UserAccount>,

    #[account(
        mut,
        seeds = [b"yrm_mint"],
        bump
    )]
    pub yrm_mint: Account<'info, Mint>,

    #[account(
        mut,
        associated_token::mint = yrm_mint,
        associated_token::authority = user
    )]
    pub user_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct TransferYrm<'info> {
    #[account(
        mut,
        seeds = [b"global_state"],
        bump = global_state.bump
    )]
    pub global_state: Account<'info, GlobalState>,

    #[account(
        mut,
        seeds = [b"user_account", from.key().as_ref()],
        bump
    )]
    pub from_account: Account<'info, UserAccount>,

    #[account(
        init_if_needed,
        payer = from,
        space = 8 + 32 + 1 + 8 + 8 + 8,
        seeds = [b"user_account", to.key().as_ref()],
        bump
    )]
    pub to_account: Account<'info, UserAccount>,

    #[account(
        mut,
        seeds = [b"yrm_mint"],
        bump
    )]
    pub yrm_mint: Account<'info, Mint>,

    #[account(
        mut,
        associated_token::mint = yrm_mint,
        associated_token::authority = from
    )]
    pub from_token_account: Account<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = from,
        associated_token::mint = yrm_mint,
        associated_token::authority = to
    )]
    pub to_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub from: Signer<'info>,

    pub to: AccountInfo<'info>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct GetStats<'info> {
    #[account(
        seeds = [b"global_state"],
        bump = global_state.bump
    )]
    pub global_state: Account<'info, GlobalState>,
}

#[event]
pub struct BurnEvent {
    pub user: Pubkey,
    pub sol_burned: u64,
    pub yrm_received: u64,
    pub tax_rate: u8,
    pub tax_amount: u64,
    pub vault_amount: u64,
    pub slot: u64,
}

#[event]
pub struct ClaimEvent {
    pub user: Pubkey,
    pub yrm_claimed: u64,
    pub slot: u64,
}

#[event]
pub struct TransferEvent {
    pub from: Pubkey,
    pub to: Pubkey,
    pub amount: u64,
    pub slot: u64,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Tax rate cannot exceed 40%")]
    TaxRateTooHigh,
    
    #[msg("Amount must be greater than 0")]
    InvalidAmount,
    
    #[msg("Insufficient YRM balance")]
    InsufficientBalance,
    
    #[msg("Nothing to claim")]
    NothingToClaim,
    
    #[msg("User account not initialized")]
    UserAccountNotInitialized,
    
    #[msg("Invalid creator address")]
    InvalidCreatorAddress,
    
    #[msg("Arithmetic overflow")]
    Overflow,
    
    #[msg("Arithmetic underflow")]
    Underflow,
    
    #[msg("Division by zero")]
    DivisionByZero,
    
    #[msg("Creator address mismatch")]
    CreatorAddressMismatch,

}
