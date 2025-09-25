// api/index.js - Using alternative APIs
const axios = require('axios');
const NodeCache = require('node-cache');

const cache = new NodeCache({ stdTTL: 300 });

// Fetch from DeFi Llama (free, no rate limit)
async function fetchFromDefiLlama() {
    try {
        console.log('Fetching from DeFi Llama...');
        
        // Get pools data from DeFi Llama
        const response = await axios.get(
            'https://yields.llama.fi/pools',
            { timeout: 15000 }
        );
        
        if (response.data && response.data.data) {
            // Filter for Uniswap and PancakeSwap pools
            const pools = response.data.data.filter(pool => 
                (pool.project === 'pancakeswap' || pool.project === 'uniswap-v2' || pool.project === 'uniswap-v3') &&
                pool.tvlUsd > 50000 &&
                pool.symbol && 
                pool.symbol.includes('-')
            );
            
            console.log(`Found ${pools.length} pools from DeFi Llama`);
            
            return pools.map(pool => {
                const [token0, token1] = pool.symbol.split('-');
                const isUniswap = pool.project.includes('uniswap');
                
                return {
                    id: pool.pool,
                    pair: pool.symbol.replace('-', '/'),
                    dex: isUniswap ? 'uniswap' : 'pancakeswap',
                    version: pool.project.includes('v3') ? 'V3' : 'V2',
                    tvl: pool.tvlUsd || 0,
                    volume24h: pool.volumeUsd1d || 0,
                    feeTier: isUniswap ? 0.003 : 0.0025,
                    token0: token0,
                    token1: token1,
                    apyBase: pool.apyBase || 0,
                    apyReward: pool.apyReward || 0,
                    chain: pool.chain
                };
            });
        }
    } catch (error) {
        console.error('DeFi Llama error:', error.message);
    }
    
    return [];
}

// Alternative: Fetch from 1inch API
async function fetchFrom1inch() {
    try {
        console.log('Fetching from 1inch...');
        
        // BSC pools
        const bscResponse = await axios.get(
            'https://api.1inch.io/v5.0/56/liquidity-sources',
            { timeout: 10000 }
        );
        
        // Ethereum pools  
        const ethResponse = await axios.get(
            'https://api.1inch.io/v5.0/1/liquidity-sources',
            { timeout: 10000 }
        );
        
        // Process and combine results
        // Note: 1inch doesn't provide TVL/Volume directly
        
    } catch (error) {
        console.error('1inch API error:', error.message);
    }
    
    return [];
}

// Backup: Generate sample pools for testing
function generateSamplePools() {
    const tokens = ['WETH', 'USDT', 'USDC', 'WBNB', 'BUSD', 'DAI', 'MATIC', 'LINK', 'UNI', 'AAVE'];
    const pools = [];
    
    for (let i = 0; i < 20; i++) {
        const token0 = tokens[Math.floor(Math.random() * tokens.length)];
        let token1 = tokens[Math.floor(Math.random() * tokens.length)];
        while (token1 === token0) {
            token1 = tokens[Math.floor(Math.random() * tokens.length)];
        }
        
        const tvl = Math.random() * 10000000 + 100000;
        const volume = tvl * (Math.random() * 0.5 + 0.1);
        const dex = Math.random() > 0.5 ? 'pancakeswap' : 'uniswap';
        
        pools.push({
            id: `0x${i.toString(16).padStart(4, '0')}`,
            pair: `${token0}/${token1}`,
            dex: dex,
            version: Math.random() > 0.5 ? 'V3' : 'V2',
            tvl: tvl,
            volume24h: volume,
            feeTier: dex === 'uniswap' ? 0.003 : 0.0025,
            token0: token0,
            token1: token1
        });
    }
    
    return pools;
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
            message: 'Cache cleared'
        });
    }
    
    // Get pools
    if (pathname.startsWith('/api/pools/')) {
        const dex = pathname.split('/').pop();
        
        try {
            // Check cache
            const cacheKey = `pools_${dex}`;
            const cachedData = cache.get(cacheKey);
            
            if (cachedData && cachedData.length > 0) {
                return res.status(200).json({
                    success: true,
                    data: cachedData,
                    cached: true,
                    timestamp: new Date().toISOString()
                });
            }
            
            let allPools = [];
            
            // Try DeFi Llama first (most reliable)
            const defiLlamaPools = await fetchFromDefiLlama();
            
            if (defiLlamaPools.length > 0) {
                allPools = defiLlamaPools;
                console.log('Using DeFi Llama data');
            } else {
                // Fallback to sample data for demo
                console.log('Using sample data as fallback');
                allPools = generateSamplePools();
            }
            
            // Filter by DEX if needed
            if (dex !== 'all') {
                allPools = allPools.filter(pool => pool.dex === dex);
            }
            
            // Calculate APR
            const poolsWithAPR = allPools.map(pool => {
                const fees24h = pool.volume24h * pool.feeTier;
                const feeApr = pool.tvl > 0 ? (fees24h * 365 / pool.tvl) * 100 : 0;
                
                return {
                    ...pool,
                    fees24h: fees24h,
                    feeApr: feeApr,
                    apr: pool.apyBase || feeApr // Use DeFi Llama APY if available
                };
            });
            
            // Sort by APR
            poolsWithAPR.sort((a, b) => b.apr - a.apr);
            
            // Limit to top 100 pools
            const topPools = poolsWithAPR.slice(0, 100);
            
            // Cache if we have data
            if (topPools.length > 0) {
                cache.set(cacheKey, topPools);
            }
            
            return res.status(200).json({
                success: true,
                data: topPools,
                source: defiLlamaPools.length > 0 ? 'defi-llama' : 'sample',
                cached: false,
                count: topPools.length,
                timestamp: new Date().toISOString()
            });
            
        } catch (error) {
            console.error('API Error:', error.message);
            
            // Return sample data on error
            const samplePools = generateSamplePools();
            const poolsWithAPR = samplePools.map(pool => {
                const fees24h = pool.volume24h * pool.feeTier;
                const feeApr = pool.tvl > 0 ? (fees24h * 365 / pool.tvl) * 100 : 0;
                return { ...pool, fees24h, feeApr, apr: feeApr };
            });
            
            return res.status(200).json({
                success: true,
                data: poolsWithAPR,
                source: 'sample',
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }
    
    return res.status(404).json({
        error: 'Not found',
        endpoints: ['/api/health', '/api/pools/all', '/api/pools/pancakeswap', '/api/pools/uniswap']
    });
};
