import Joi from 'joi';
import { ethers } from 'ethers';
import { RelayRequest, FeeEstimateRequest } from '../types';

// Validation schemas for GaslessTransactionRequest
const gaslessTransactionRequestSchema = Joi.object({
  fromAddress: Joi.string().custom(isValidAddress).required(),
  toAddress: Joi.string().custom(isValidAddress).required(),
  tokenContract: Joi.string().custom(isValidAddress).required(),
  transferAmount: Joi.string().custom(isValidBigNumber).required(),
  relayerServiceFee: Joi.string().custom(isValidBigNumber).required(),
  transactionNonce: Joi.string().custom(isValidBigNumber).required(),
  expirationDeadline: Joi.string().custom(isValidBigNumber).required()
});

const permitSignatureSchema = Joi.object({
  approvalValue: Joi.string().custom(isValidBigNumber).required(),
  permitDeadline: Joi.string().custom(isValidBigNumber).required(),
  signatureV: Joi.number().integer().min(0).max(255).required(),
  signatureR: Joi.string().custom(isValidBytes32).required(),
  signatureS: Joi.string().custom(isValidBytes32).required()
});

export const relayRequestSchema = Joi.object({
  chainId: Joi.number().valid(5920, 84532, 421614).required(), // Kadena, Base, Arbitrum
  request: gaslessTransactionRequestSchema.required(),
  permit: permitSignatureSchema.optional(),
  signature: Joi.string().custom(isValidSignature).required()
});

export const feeEstimateSchema = Joi.object({
  chainId: Joi.number().valid(5920, 84532, 421614).required(),
  tokenSymbol: Joi.string().valid('TUSDC', 'USDC', 'PYUSD').required(),
  amount: Joi.string().custom(isValidBigNumber).required()
});

// Custom validation functions
function isValidAddress(value: string, helpers: any) {
  try {
    if (!ethers.isAddress(value)) {
      return helpers.error('any.invalid');
    }
    return value;
  } catch {
    return helpers.error('any.invalid');
  }
}

function isValidBigNumber(value: string, helpers: any) {
  try {
    const bn = BigInt(value);
    if (bn < 0) {
      return helpers.error('any.invalid');
    }
    return value;
  } catch {
    return helpers.error('any.invalid');
  }
}

function isValidSignature(value: string, helpers: any) {
  try {
    // Basic hex string validation for signature (65 bytes = 130 hex chars + 0x)
    if (!/^0x[0-9a-fA-F]{130}$/.test(value)) {
      return helpers.error('any.invalid');
    }
    return value;
  } catch {
    return helpers.error('any.invalid');
  }
}

function isValidBytes32(value: string, helpers: any) {
  try {
    // 32 bytes = 64 hex chars + 0x
    if (!/^0x[0-9a-fA-F]{64}$/.test(value)) {
      return helpers.error('any.invalid');
    }
    return value;
  } catch {
    return helpers.error('any.invalid');
  }
}

// Validation functions
export const validateRelayRequest = (data: any): { error?: any; value?: RelayRequest } => {
  return relayRequestSchema.validate(data);
};

export const validateFeeEstimateRequest = (data: any): { error?: any; value?: FeeEstimateRequest } => {
  return feeEstimateSchema.validate(data);
};

// Security validations
export const isValidDeadline = (deadline: number): boolean => {
  const now = Math.floor(Date.now() / 1000);
  const maxDeadline = now + (24 * 60 * 60); // 24 hours from now
  return deadline >= now && deadline <= maxDeadline;
};

export const isValidAmount = (amount: string, minAmount: string = '1'): boolean => {
  try {
    const amountBN = BigInt(amount);
    const minAmountBN = BigInt(minAmount);
    return amountBN >= minAmountBN;
  } catch {
    return false;
  }
};

export const sanitizeInput = (input: string): string => {
  return input.trim().toLowerCase();
};

export const isValidTransactionHash = (hash: string): boolean => {
  return /^0x[0-9a-fA-F]{64}$/.test(hash);
};