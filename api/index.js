// api/index.js - DeFi Llama API Integration
const axios = require('axios');
const NodeCache = require('node-cache');

// Cache for 5 minutes
const cache = new NodeCache({ stdTTL: 300 });

// Fetch pools from DeFi Llama
async function fetchDefiLlamaPools() {
    try {
        console.log('Fetching pools from DeFi Llama...');
        
        const response = await axios.get('https://yields.llama.fi/pools', {
            timeout: 20000,
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        if (response.data && response.data.data) {
            const pools = response.data.data;
            console.log(`Fetched ${pools.length} total pools from DeFi Llama`);
            
            // Filter for PancakeSwap and Uniswap pools only
            const filteredPools = pools.filter(pool => {
                // Check if it's PancakeSwap or Uniswap
                const isPancake = pool.project && pool.project.toLowerCase().includes('pancake');
                const isUniswap = pool.project && pool.project.toLowerCase().includes('uniswap');
                
                // Must be one of our target DEXes
                if (!isPancake && !isUniswap) return false;
                
                // Must have minimum TVL
                if (!pool.tvlUsd || pool.tvlUsd < 50000) return false;
                
                // Must have valid symbol
                if (!pool.symbol) return false;
                
                return true;
            });
            
            console.log(`Filtered to ${filteredPools.length} PancakeSwap/Uniswap pools`);
            
            // Transform to our format
            return filteredPools.map(pool => {
                // Parse token pair from symbol
                let token0 = '';
                let token1 = '';
                
                // Handle different symbol formats
                if (pool.symbol.includes('-')) {
                    [token0, token1] = pool.symbol.split('-');
                } else if (pool.symbol.includes('/')) {
                    [token0, token1] = pool.symbol.split('/');
                } else {
                    // Try to parse complex symbols
                    token0 = pool.symbol.substring(0, pool.symbol.length/2);
                    token1 = pool.symbol.substring(pool.symbol.length/2);
                }
                
                // Clean up token symbols
                token0 = token0.trim().toUpperCase();
                token1 = token1.trim().toUpperCase();
                
                // Determine DEX
                const isPancake = pool.project.toLowerCase().includes('pancake');
                const dex = isPancake ? 'pancakeswap' : 'uniswap';
                
                // Determine version
                let version = 'V2';
                if (pool.project.includes('v3') || pool.project.includes('V3')) {
                    version = 'V3';
                }
                
                // Get chain
                const chain = pool.chain || 'unknown';
                
                // Calculate volume (if not provided, estimate from TVL)
                const volume24h = pool.volumeUsd1d || (pool.tvlUsd * 0.1); // 10% of TVL as rough estimate
                
                // Get APY/APR
                const apy = pool.apy || 0;
                const apyBase = pool.apyBase || 0;
                const apyReward = pool.apyReward || 0;
                
                // Determine fee tier based on project and pool info
                let feeTier = 0.003; // default
                if (isPancake) {
                    feeTier = 0.0025; // PancakeSwap default
                } else if (pool.project.includes('v3')) {
                    // Uniswap V3 has multiple fee tiers, use common one
                    feeTier = 0.003;
                }
                
                return {
                    id: pool.pool || `${dex}-${token0}-${token1}`,
                    pair: `${token0}/${token1}`,
                    dex: dex,
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
    
    // Health check endpoint
    if (pathname === '/api/health') {
        return res.status(200).json({
            status: 'healthy',
            cache: cache.getStats(),
            timestamp: new Date().toISOString()
        });
    }
    
    // Clear cache endpoint
    if (pathname === '/api/cache/clear' && req.method === 'POST') {
        cache.flushAll();
        return res.status(200).json({
            success: true,
            message: 'Cache cleared',
            timestamp: new Date().toISOString()
        });
    }
    
    // Get pools endpoint
    if (pathname.startsWith('/api/pools/')) {
        const dex = pathname.split('/').pop().toLowerCase();
        
        try {
            // Check cache first
            const cacheKey = `defillama_pools_${dex}`;
            const cachedData = cache.get(cacheKey);
            
            if (cachedData && cachedData.length > 0) {
                console.log(`Returning ${cachedData.length} cached pools for ${dex}`);
                return res.status(200).json({
                    success: true,
                    data: cachedData,
                    source: 'defi-llama',
                    cached: true,
                    count: cachedData.length,
                    timestamp: new Date().toISOString()
                });
            }
            
            // Fetch fresh data from DeFi Llama
            console.log(`Fetching fresh pools data for: ${dex}`);
            let allPools = await fetchDefiLlamaPools();
            
            // Filter by DEX if specified
            if (dex !== 'all') {
                allPools = allPools.filter(pool => pool.dex === dex);
                console.log(`Filtered to ${allPools.length} ${dex} pools`);
            }
            
            // Calculate fees and APR for each pool
            const poolsWithCalculations = allPools.map(pool => {
                // Calculate daily fees
                const fees24h = pool.volume24h * pool.feeTier;
                
                // Calculate fee-based APR
                const feeApr = pool.tvl > 0 ? (fees24h * 365 / pool.tvl) * 100 : 0;
                
                // Use DeFi Llama's APY if available, otherwise use our calculation
                const apr = pool.apyBase > 0 ? pool.apyBase : feeApr;
                
                return {
                    ...pool,
                    fees24h: fees24h,
                    feeApr: feeApr,
                    apr: apr,
                    totalApr: apr + (pool.apyReward || 0) // Include rewards if any
                };
            });
            
            // Sort by APR (highest first)
            poolsWithCalculations.sort((a, b) => b.apr - a.apr);
            
            // Limit to top 200 pools to avoid too much data
            const topPools = poolsWithCalculations.slice(0, 200);
            
            // Cache the results
            if (topPools.length > 0) {
                cache.set(cacheKey, topPools);
                console.log(`Cached ${topPools.length} pools for ${dex}`);
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
            console.error('Error in pools endpoint:', error.message);
            
            // Return empty array with error info
            return res.status(200).json({
                success: false,
                data: [],
                source: 'defi-llama',
                error: error.message,
                message: 'Failed to fetch pools. DeFi Llama might be down or rate limiting.',
                timestamp: new Date().toISOString()
            });
        }
    }
    
    // 404 for unknown endpoints
    return res.status(404).json({
        error: 'Endpoint not found',
        availableEndpoints: [
            '/api/health',
            '/api/pools/all',
            '/api/pools/pancakeswap',
            '/api/pools/uniswap',
            '/api/cache/clear (POST)'
        ],
        timestamp: new Date().toISOString()
    });
};
