// recon/config.js
// Extended examples for local reconciliation logic; no LLM used.
export const examples = [
  {
    title: 'US Equities vs Options Breaks',
    abor: `instrument,qty,price\nAAPL,100,195.30\nTSLA,50,250.10\nMSFT,75,410.20\nSPY,200,507.50\nSPX_Option_Call_4500,10,12.50`,
    ibor: `instrument,qty,price\nAAPL,100,195.30\nTSLA,40,260.00\nMSFT,80,409.70\nSPY,200,507.40\nSPX_Option_Call_4500,10,12.80`,
  },
  {
    title: 'UST Bond Price Stale vs Futures',
    abor: `instrument,qty,price\nUS91282CJL6,200000,100.10\nEURUSD_FUT_DEC24,12,0\nIBM,0,182.40\nGLD,500,198.00`,
    ibor: `instrument,qty,price\nUS91282CJL6,200000,99.90\nEURUSD_FUT_DEC24,10,0\nIBM,5,182.00\nGLD,480,198.10`,
  },
  {
    title: 'FX Rounding & UK Equity',
    abor: `instrument,qty,price\nVOD.L,1000,1.12\nBTC-ETF,120,52.30\nBRK.B,60,415.20`,
    ibor: `instrument,qty,price\nVOD.L,950,1.10\nBTC-ETF,120,52.00\nBRK.B,60,415.20`,
  },
  {
    title: 'Credit vs Derivatives Pack',
    abor: `instrument,qty,price\nHYG,300,79.10\nJNK,250,93.20\nCDS_IBM_5Y,5,0\nIRS_USD_2Y,10,0`,
    ibor: `instrument,qty,price\nHYG,300,79.05\nJNK,250,93.20\nCDS_IBM_5Y,5,0\nIRS_USD_2Y,9,0`,
  },
  {
    title: 'Commodities & Structured Notes',
    abor: `instrument,qty,price\nXOM,500,105.40\nCL_FUT_JAN25,20,0\nSN_STRUC_NOTE_ABC123,1000000,98.80`,
    ibor: `instrument,qty,price\nXOM,500,105.40\nCL_FUT_JAN25,18,0\nSN_STRUC_NOTE_ABC123,1000000,99.20`,
  },
  {
    title: 'ETF Basket + Corporate Actions',
    abor: `instrument,qty,price\nQQQ,100,420.10\nIVV,100,505.80\nAAPL,100,195.30\nTSLA,50,250.10`,
    ibor: `instrument,qty,price\nQQQ,100,420.50\nIVV,100,505.70\nAAPL,100,197.00\nTSLA,50,249.90`,
  },
  {
    title: 'Emerging Markets Mix',
    abor: `instrument,qty,price\nTCS.NS,100,4100\nINFY.NS,150,1600\nUSDINR_FUT_DEC24,8,0`,
    ibor: `instrument,qty,price\nTCS.NS,100,4100\nINFY.NS,140,1650\nUSDINR_FUT_DEC24,8,0`,
  },
  {
    title: 'Alternatives & Private Debt',
    abor: `instrument,qty,price\nPDL_PRIVATE_2024,500000,92.3\nREIT_XYZ,1000,35.2\nGOLD_PHYS,75,2200`,
    ibor: `instrument,qty,price\nPDL_PRIVATE_2024,500000,92.1\nREIT_XYZ,995,35.4\nGOLD_PHYS,75,2205`,
  },
  // New, more complex examples
  {
    title: 'Shorts, Cash & FX',
    abor: `instrument,qty,price\nAAPL,-50,195.30\nCASH_USD,100000,1\nEURUSD_SPOT,50000,1.08\nUS91282CJL6,200000,99.50`,
    ibor: `instrument,qty,price\nAAPL,-45,197.00\nCASH_USD,99500,1\nEURUSD_SPOT,52000,1.07\nUS91282CJL6,200000,99.60`,
  },
  {
    title: 'Futures With Multipliers',
    abor: `instrument,qty,price,multiplier\nCL_FUT_JAN25,20,75,1000\nES_FUT_DEC24,5,5000,50\nGLD,500,198,1`,
    ibor: `instrument,qty,price,multiplier\nCL_FUT_JAN25,19,76,1000\nES_FUT_DEC24,5,4990,50\nGLD,500,198.1,1`,
  },
  {
    title: 'Corporate Action: 2-for-1 Split',
    abor: `instrument,qty,price\nTSM,100,120\nQQQ,50,420.1`,
    ibor: `instrument,qty,price\nTSM,200,60\nQQQ,50,420.5`,
  },
  {
    title: 'OTC Swaps With Notional Provided',
    abor: `instrument,qty,price,notional\nIRS_USD_2Y,10,0,1000000\nCDS_IBM_5Y,5,0,2500000\nHYG,300,79.1`,
    ibor: `instrument,qty,price,notional\nIRS_USD_2Y,9,0,900000\nCDS_IBM_5Y,5,0,2500000\nHYG,300,79.0`,
  },
  {
    title: 'Duplicates & Rounding',
    abor: `instrument,qty,price\nSPY,100,507.50\nSPY,100,507.50\nVOD.L,999.6,1.120`,
    ibor: `instrument,qty,price\nSPY,200,507.40\nVOD.L,1000.0,1.119`,
  },
];
