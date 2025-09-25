// api/index.js - Complete version with all DEXes and chains
const axios = require('axios');
const NodeCache = require('node-cache');

const cache = new NodeCache({ stdTTL: 300 });

// Fetch ALL pools from DeFi Llama (not just Uniswap/PancakeSwap)
async function fetchDefiLlamaPools() {
    try {
        console.log('Fetching pools from DeFi Llama...');
        
        const response = await axios.get('https://yields.llama.fi/pools', {
            timeout: 30000,
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0'
            }
        });
        
        if (response.data && response.data.data) {
            const pools = response.data.data;
            console.log(`Fetched ${pools.length} total pools from DeFi Llama`);
            
            // Filter for major DEXes and minimum TVL
            const filteredPools = pools.filter(pool => {
                // Check if it's a DEX (not lending, etc)
                if (!pool.project) return false;
                
                // List of DEXes we want to include
                const dexProjects = [
                    'uniswap-v2', 'uniswap-v3',
                    'pancakeswap', 'pancakeswap-v2', 'pancakeswap-v3', 
                    'sushiswap', 'sushiswap-v3',
                    'curve', 'curve-dex',
                    'balancer', 'balancer-v2',
                    'quickswap', 'quickswap-v3',
                    'trader-joe', 'trader-joe-v2',
                    'spookyswap',
                    'biswap',
                    'apeswap',
                    'camelot', 'camelot-v3',
                    'velodrome', 'velodrome-v2',
                    'aerodrome',
                    'thena', 'thena-v3',
                    'raydium',
                    'orca'
                ];
                
                const projectLower = pool.project.toLowerCase();
                const isDex = dexProjects.some(dex => projectLower.includes(dex));
                
                if (!isDex) return false;
                
                // Must have minimum TVL ($10k)
                if (!pool.tvlUsd || pool.tvlUsd < 10000) return false;
                
                // Must have valid symbol
                if (!pool.symbol) return false;
                
                // Skip stable pools for now (optional)
                // if (pool.stablecoin === true) return false;
                
                return true;
            });
            
            console.log(`Filtered to ${filteredPools.length} DEX pools`);
            
            // Transform to our format
            return filteredPools.map(pool => {
                // Parse token pair from symbol
                let token0 = '';
                let token1 = '';
                
                if (pool.symbol.includes('-')) {
                    const parts = pool.symbol.split('-');
                    token0 = parts[0] || '';
                    token1 = parts.slice(1).join('-') || ''; // Handle multi-part symbols
                } else if (pool.symbol.includes('/')) {
                    [token0, token1] = pool.symbol.split('/');
                } else {
                    token0 = pool.symbol;
                    token1 = '';
                }
                
                // Clean up token symbols
                token0 = token0.trim();
                token1 = token1.trim();
                
                // Determine DEX name (simplified)
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
                else dexName = pool.project.toLowerCase().replace(/[-\s]/g, '');
                
                // Determine version
                let version = 'V2';
                if (pool.project.includes('v3') || pool.project.includes('V3')) {
                    version = 'V3';
                } else if (pool.project.includes('v1') || pool.project.includes('V1')) {
                    version = 'V1';
                }
                
                // Get chain - normalize chain names
                let chain = (pool.chain || 'unknown').toLowerCase();
                if (chain === 'binance') chain = 'bsc';
                else if (chain === 'polygon') chain = 'polygon';
                else if (chain === 'avalanche') chain = 'avax';
                else if (chain === 'fantom') chain = 'ftm';
                else if (chain === 'arbitrum') chain = 'arbitrum';
                else if (chain === 'optimism') chain = 'optimism';
                else if (chain === 'ethereum') chain = 'eth';
                
                // Calculate volume (if not provided, estimate from TVL)
                const volume24h = pool.volumeUsd1d || pool.volumeUsd7d / 7 || (pool.tvlUsd * 0.05);
                
                // Get APY/APR
                const apy = pool.apy || 0;
                const apyBase = pool.apyBase || 0;
                const apyReward = pool.apyReward || 0;
                
                // Estimate fee tier based on DEX
                let feeTier = 0.003; // default
                if (dexName === 'pancakeswap') feeTier = 0.0025;
                else if (dexName === 'uniswap' && version === 'V3') feeTier = 0.003;
                else if (dexName === 'sushiswap') feeTier = 0.003;
                else if (dexName === 'curve') feeTier = 0.0004; // Curve has lower fees
                
                // Generate pool URL (approximate - would need exact addresses for real URLs)
                let poolUrl = '';
                if (dexName === 'pancakeswap') {
                    poolUrl = `https://pancakeswap.finance/liquidity/`;
                } else if (dexName === 'uniswap') {
                    poolUrl = `https://app.uniswap.org/pools`;
                } else if (dexName === 'sushiswap') {
                    poolUrl = `https://www.sushi.com/pool`;
                }
                
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
                    apyTotal: apy,
                    apyBase: apyBase,
                    apyReward: apyReward,
                    ilRisk: pool.ilRisk || 'unknown',
                    exposure: pool.exposure || 'multi',
                    stablecoin: pool.stablecoin || false,
                    poolUrl: poolUrl,
                    poolMeta: pool.poolMeta || null
                };
            });
        }
        
        return [];
        
    } catch (error) {
        console.error('Error fetching from DeFi Llama:', error.message);
        throw error;
    }
}

module.exports = async (req, res) => {
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
                const fees24h = pool.volume24h * pool.feeTier;
                const feeApr = pool.tvl > 0 ? (fees24h * 365 / pool.tvl) * 100 : 0;
                
                // Use DeFi Llama's APY if available, otherwise use our calculation
                const apr = pool.apyBase > 0 ? pool.apyBase : feeApr;
                
                return {
                    ...pool,
                    fees24h: fees24h,
                    feeApr: feeApr,
                    apr: apr,
                    totalApr: apr + (pool.apyReward || 0)
                };
            });
            
            // Sort by APR (highest first)
            poolsWithCalculations.sort((a, b) => b.apr - a.apr);
            
            // Remove extreme outliers (APR > 10000%)
            const reasonablePools = poolsWithCalculations.filter(pool => pool.apr < 10000);
            
            // Limit to top 500 pools
            const topPools = reasonablePools.slice(0, 500);
            
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
                timestamp: new Date().toISOString()
            });
        }
    }
    
    return res.status(404).json({
        error: 'Not found',
        endpoints: [
            '/api/health',
            '/api/pools/all',
            '/api/pools/pancakeswap',
            '/api/pools/uniswap',
            '/api/pools/sushiswap',
            '/api/cache/clear'
        ]
    });
};
