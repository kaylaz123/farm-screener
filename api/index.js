// api/index.js - Final Complete Version
const axios = require('axios');
const NodeCache = require('node-cache');

const cache = new NodeCache({ stdTTL: 300 }); // 5 minute cache

// Fetch ALL pools from DeFi Llama
async function fetchDefiLlamaPools() {
    try {
        console.log('Fetching ALL pools from DeFi Llama...');
        
        const response = await axios.get('https://yields.llama.fi/pools', {
            timeout: 30000,
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0'
            }
        });
        
        if (response.data && response.data.data) {
            const allPools = response.data.data;
            console.log(`Fetched ${allPools.length} total pools from DeFi Llama`);
            
            // Filter only DEX pools (not lending, etc) with minimal filtering
            const dexPools = allPools.filter(pool => {
                if (!pool.project) return false;
                
                // List of DEX projects (expanded list)
                const dexKeywords = [
                    'swap', 'dex', 'amm', 'exchange', 
                    'uniswap', 'pancakeswap', 'sushiswap', 
                    'curve', 'balancer', 'quickswap', 
                    'trader-joe', 'spooky', 'spirit',
                    'biswap', 'apeswap', 'camelot',
                    'velodrome', 'aerodrome', 'thena',
                    'raydium', 'orca', 'serum',
                    'osmosis', 'astroport', 'terraswap',
                    'kyberswap', 'dodo', 'platypus',
                    'wombat', 'maverick', 'izumi',
                    'algebra', 'zyberswap', 'baseswap'
                ];
                
                const projectLower = pool.project.toLowerCase();
                const isDex = dexKeywords.some(keyword => projectLower.includes(keyword));
                
                // Include if it's a DEX
                if (!isDex) return false;
                
                // Very minimal TVL filter - only exclude tiny pools
                if (!pool.tvlUsd || pool.tvlUsd < 1000) return false;
                
                // Must have valid symbol
                if (!pool.symbol) return false;
                
                return true;
            });
            
            console.log(`Filtered to ${dexPools.length} DEX pools`);
            
            // Transform to our format
            return dexPools.map(pool => {
                // Parse token pair
                let token0 = '';
                let token1 = '';
                
                // Handle different symbol formats
                const symbol = pool.symbol || '';
                if (symbol.includes('-')) {
                    const parts = symbol.split('-');
                    token0 = parts[0] || '';
                    token1 = parts.slice(1).join('-') || '';
                } else if (symbol.includes('/')) {
                    [token0, token1] = symbol.split('/');
                } else {
                    // Single token or complex format
                    token0 = symbol;
                    token1 = '';
                }
                
                // Clean up tokens
                token0 = token0.trim();
                token1 = token1.trim();
                
                // Normalize DEX names
                let dexName = pool.project.toLowerCase();
                if (dexName.includes('pancake')) dexName = 'pancakeswap';
                else if (dexName.includes('uniswap')) dexName = 'uniswap';
                else if (dexName.includes('sushi')) dexName = 'sushiswap';
                else if (dexName.includes('curve')) dexName = 'curve';
                else if (dexName.includes('balancer')) dexName = 'balancer';
                else if (dexName.includes('quickswap')) dexName = 'quickswap';
                else if (dexName.includes('trader-joe')) dexName = 'traderjoe';
                else if (dexName.includes('velodrome')) dexName = 'velodrome';
                else if (dexName.includes('aerodrome')) dexName = 'aerodrome';
                else if (dexName.includes('thena')) dexName = 'thena';
                else if (dexName.includes('camelot')) dexName = 'camelot';
                else if (dexName.includes('raydium')) dexName = 'raydium';
                else if (dexName.includes('orca')) dexName = 'orca';
                else if (dexName.includes('biswap')) dexName = 'biswap';
                else if (dexName.includes('apeswap')) dexName = 'apeswap';
                else if (dexName.includes('spooky')) dexName = 'spookyswap';
                else if (dexName.includes('spirit')) dexName = 'spiritswap';
                else if (dexName.includes('kyber')) dexName = 'kyberswap';
                else dexName = pool.project.toLowerCase().replace(/[-\s]/g, '');
                
                // Determine version
                let version = 'V2';
                if (pool.project.includes('v3') || pool.project.includes('V3')) {
                    version = 'V3';
                } else if (pool.project.includes('v1') || pool.project.includes('V1')) {
                    version = 'V1';
                }
                
                // Normalize chain names
                let chain = (pool.chain || 'unknown').toLowerCase();
                const chainMap = {
                    'binance': 'bsc',
                    'bsc': 'bsc',
                    'ethereum': 'eth',
                    'polygon': 'polygon',
                    'avalanche': 'avax',
                    'fantom': 'ftm',
                    'arbitrum': 'arbitrum',
                    'optimism': 'optimism',
                    'base': 'base',
                    'gnosis': 'gnosis',
                    'celo': 'celo',
                    'moonbeam': 'moonbeam',
                    'cronos': 'cronos',
                    'aurora': 'aurora',
                    'metis': 'metis',
                    'kava': 'kava',
                    'zksync': 'zksync',
                    'linea': 'linea',
                    'scroll': 'scroll',
                    'manta': 'manta',
                    'mode': 'mode',
                    'blast': 'blast'
                };
                chain = chainMap[chain] || chain;
                
                // Get volume (use provided or estimate)
                const volume24h = pool.volumeUsd1d || pool.volumeUsd7d / 7 || (pool.tvlUsd * 0.02);
                
                // Get all APY values
                const apyTotal = pool.apy || 0;
                const apyBase = pool.apyBase || 0;
                const apyReward = pool.apyReward || 0;
                
                // Use the highest APY available
                const apr = Math.max(apyTotal, apyBase, apyBase + apyReward);
                
                // Estimate fee tier
                let feeTier = 0.003;
                if (dexName === 'pancakeswap') feeTier = 0.0025;
                else if (dexName === 'uniswap' && version === 'V3') feeTier = 0.003;
                else if (dexName === 'curve') feeTier = 0.0004;
                else if (dexName === 'balancer') feeTier = 0.002;
                
                // Generate pool URL
                const poolUrls = {
                    'pancakeswap': 'https://pancakeswap.finance/liquidity',
                    'uniswap': 'https://app.uniswap.org/pools',
                    'sushiswap': 'https://www.sushi.com/pool',
                    'curve': 'https://curve.fi/pools',
                    'balancer': 'https://app.balancer.fi/#/pools',
                    'quickswap': 'https://quickswap.exchange/#/pools',
                    'traderjoe': 'https://traderjoexyz.com/pool',
                    'velodrome': 'https://app.velodrome.finance/liquidity',
                    'aerodrome': 'https://aerodrome.finance/liquidity',
                    'thena': 'https://www.thena.fi/liquidity',
                    'camelot': 'https://app.camelot.exchange/liquidity',
                    'raydium': 'https://raydium.io/liquidity',
                    'orca': 'https://www.orca.so/pools',
                    'biswap': 'https://biswap.org/liquidity',
                    'apeswap': 'https://apeswap.finance/liquidity',
                    'spookyswap': 'https://spooky.fi/#/add',
                    'spiritswap': 'https://www.spiritswap.finance/liquidity'
                };
                
                return {
                    id: pool.pool || `${dexName}-${token0}-${token1}`,
                    pair: token1 ? `${token0}/${token1}` : token0,
                    dex: dexName,
                    version: version,
                    chain: chain,
                    tvl: pool.tvlUsd || 0,
                    volume24h: volume24h,
                    feeTier: feeTier,
                    token0: token0,
                    token1: token1,
                    apyTotal: apyTotal,
                    apyBase: apyBase,
                    apyReward: apyReward,
                    apr: apr, // Main APR to display
                    ilRisk: pool.ilRisk || 'unknown',
                    exposure: pool.exposure || 'multi',
                    stablecoin: pool.stablecoin || false,
                    poolUrl: poolUrls[dexName] || '#',
                    project: pool.project // Keep original project name
                };
            });
        }
        
        return [];
        
    } catch (error) {
        console.error('Error fetching from DeFi Llama:', error.message);
        throw error;
    }
}

// Main Vercel handler
module.exports = async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;
    const searchParams = url.searchParams;
    
    // Health check
    if (pathname === '/api/health') {
        return res.status(200).json({
            status: 'healthy',
            cache: cache.getStats(),
            timestamp: new Date().toISOString()
        });
    }
    
    // Clear cache
    if (pathname === '/api/cache/clear' && req.method === 'POST') {
        cache.flushAll();
        return res.status(200).json({
            success: true,
            message: 'Cache cleared',
            timestamp: new Date().toISOString()
        });
    }
    
    // Get pools
    if (pathname.startsWith('/api/pools/')) {
        const dex = pathname.split('/').pop().toLowerCase();
        const chain = searchParams.get('chain')?.toLowerCase() || 'all';
        
        try {
            // Check cache
            const cacheKey = `pools_${dex}_${chain}`;
            const cachedData = cache.get(cacheKey);
            
            if (cachedData && cachedData.length > 0) {
                console.log(`Returning ${cachedData.length} cached pools`);
                return res.status(200).json({
                    success: true,
                    data: cachedData,
                    source: 'defi-llama',
                    cached: true,
                    count: cachedData.length,
                    timestamp: new Date().toISOString()
                });
            }
            
            // Fetch fresh data
            console.log(`Fetching fresh pools data...`);
            let allPools = await fetchDefiLlamaPools();
            
            // Filter by DEX if specified
            if (dex !== 'all') {
                allPools = allPools.filter(pool => pool.dex === dex);
                console.log(`Filtered to ${allPools.length} ${dex} pools`);
            }
            
            // Filter by chain if specified
            if (chain !== 'all') {
                allPools = allPools.filter(pool => pool.chain === chain);
                console.log(`Filtered to ${allPools.length} pools on ${chain}`);
            }
            
            // Calculate fees and APR
            const poolsWithCalculations = allPools.map(pool => {
                // Calculate daily fees
                const fees24h = pool.volume24h * pool.feeTier;
                
                // Calculate fee-based APR (if not provided)
                const feeApr = pool.tvl > 0 ? (fees24h * 365 / pool.tvl) * 100 : 0;
                
                // Use DeFi Llama APR if available, otherwise use calculated
                const finalApr = pool.apr > 0 ? pool.apr : feeApr;
                
                return {
                    ...pool,
                    fees24h: fees24h,
                    feeApr: feeApr,
                    apr: finalApr,
                    totalApr: finalApr + (pool.apyReward || 0)
                };
            });
            
            // Sort by APR (highest first)
            poolsWithCalculations.sort((a, b) => b.apr - a.apr);
            
            // DON'T filter out high APR pools - show everything!
            // Users can filter themselves using the UI
            
            // Limit to top 1000 pools to avoid too much data
            const topPools = poolsWithCalculations.slice(0, 1000);
            
            // Cache if we have data
            if (topPools.length > 0) {
                cache.set(cacheKey, topPools);
                console.log(`Cached ${topPools.length} pools`);
            }
            
            return res.status(200).json({
                success: true,
                data: topPools,
                source: 'defi-llama',
                cached: false,
                count: topPools.length,
                timestamp: new Date().toISOString()
            });
            
        } catch (error) {
            console.error('Error:', error.message);
            return res.status(200).json({
                success: false,
                data: [],
                error: error.message,
                message: 'Failed to fetch pools',
                timestamp: new Date().toISOString()
            });
        }
    }
    
    // 404
    return res.status(404).json({
        error: 'Not found',
        endpoints: [
            '/api/health',
            '/api/pools/all',
            '/api/pools/pancakeswap',
            '/api/pools/uniswap',
            '/api/cache/clear'
        ]
    });
};
