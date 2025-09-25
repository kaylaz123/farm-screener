// api/index.js - Fetch real pools from The Graph
const axios = require('axios');
const NodeCache = require('node-cache');

// Initialize cache with 5 minute TTL
const cache = new NodeCache({ stdTTL: 300 });

// Helper function untuk fetch GraphQL
async function fetchGraphQL(url, query, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            console.log(`Fetching from ${url}, attempt ${i + 1}`);
            
            const response = await axios({
                url: url,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                },
                data: JSON.stringify({ query }),
                timeout: 15000 // 15 second timeout
            });

            if (response.data && response.data.data) {
                return response.data.data;
            }
            
            console.log('No data in response:', response.data);
            
        } catch (error) {
            console.error(`Attempt ${i + 1} failed:`, error.message);
            if (i === retries - 1) {
                throw error;
            }
            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
    return null;
}

// Fetch PancakeSwap V2 pools
async function fetchPancakeSwapV2() {
    const query = `
        query {
            pairs(
                first: 100, 
                orderBy: reserveUSD, 
                orderDirection: desc,
                where: { reserveUSD_gt: "50000" }
            ) {
                id
                token0 {
                    symbol
                    name
                }
                token1 {
                    symbol
                    name
                }
                reserveUSD
                volumeUSD
                token0Price
                token1Price
                reserve0
                reserve1
            }
        }
    `;
    
    try {
        const data = await fetchGraphQL(
            'https://api.thegraph.com/subgraphs/name/pancakeswap/exchange',
            query
        );
        
        if (data && data.pairs) {
            console.log(`Fetched ${data.pairs.length} PancakeSwap V2 pairs`);
            return data.pairs.map(pair => ({
                id: pair.id,
                pair: `${pair.token0.symbol}/${pair.token1.symbol}`,
                dex: 'pancakeswap',
                version: 'V2',
                tvl: parseFloat(pair.reserveUSD || 0),
                volume24h: parseFloat(pair.volumeUSD || 0) / 7, // Rough daily estimate
                feeTier: 0.0025, // PancakeSwap V2 fee
                token0: pair.token0.symbol,
                token1: pair.token1.symbol
            }));
        }
    } catch (error) {
        console.error('Failed to fetch PancakeSwap V2:', error.message);
    }
    
    return [];
}

// Fetch PancakeSwap V3 pools (BSC)
async function fetchPancakeSwapV3() {
    const query = `
        query {
            pools(
                first: 50,
                orderBy: totalValueLockedUSD,
                orderDirection: desc,
                where: { totalValueLockedUSD_gt: "50000" }
            ) {
                id
                token0 {
                    symbol
                    name
                }
                token1 {
                    symbol
                    name
                }
                totalValueLockedUSD
                volumeUSD
                feeTier
            }
        }
    `;
    
    try {
        const data = await fetchGraphQL(
            'https://api.thegraph.com/subgraphs/name/pancakeswap/exchange-v3-bsc',
            query
        );
        
        if (data && data.pools) {
            console.log(`Fetched ${data.pools.length} PancakeSwap V3 pools`);
            return data.pools.map(pool => ({
                id: pool.id,
                pair: `${pool.token0.symbol}/${pool.token1.symbol}`,
                dex: 'pancakeswap',
                version: 'V3',
                tvl: parseFloat(pool.totalValueLockedUSD || 0),
                volume24h: parseFloat(pool.volumeUSD || 0) / 7, // Rough daily estimate
                feeTier: parseInt(pool.feeTier) / 1000000,
                token0: pool.token0.symbol,
                token1: pool.token1.symbol
            }));
        }
    } catch (error) {
        console.error('Failed to fetch PancakeSwap V3:', error.message);
    }
    
    return [];
}

// Fetch Uniswap V2 pools
async function fetchUniswapV2() {
    const query = `
        query {
            pairs(
                first: 100,
                orderBy: reserveUSD,
                orderDirection: desc,
                where: { reserveUSD_gt: "100000" }
            ) {
                id
                token0 {
                    symbol
                    name
                }
                token1 {
                    symbol
                    name
                }
                reserveUSD
                volumeUSD
                token0Price
                token1Price
            }
        }
    `;
    
    try {
        const data = await fetchGraphQL(
            'https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v2',
            query
        );
        
        if (data && data.pairs) {
            console.log(`Fetched ${data.pairs.length} Uniswap V2 pairs`);
            return data.pairs.map(pair => ({
                id: pair.id,
                pair: `${pair.token0.symbol}/${pair.token1.symbol}`,
                dex: 'uniswap',
                version: 'V2',
                tvl: parseFloat(pair.reserveUSD || 0),
                volume24h: parseFloat(pair.volumeUSD || 0) / 7, // Rough daily estimate
                feeTier: 0.003, // Uniswap V2 fee
                token0: pair.token0.symbol,
                token1: pair.token1.symbol
            }));
        }
    } catch (error) {
        console.error('Failed to fetch Uniswap V2:', error.message);
    }
    
    return [];
}

// Fetch Uniswap V3 pools
async function fetchUniswapV3() {
    const query = `
        query {
            pools(
                first: 50,
                orderBy: totalValueLockedUSD,
                orderDirection: desc,
                where: { totalValueLockedUSD_gt: "100000" }
            ) {
                id
                token0 {
                    symbol
                    name
                }
                token1 {
                    symbol
                    name
                }
                totalValueLockedUSD
                volumeUSD
                feeTier
            }
        }
    `;
    
    try {
        const data = await fetchGraphQL(
            'https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3',
            query
        );
        
        if (data && data.pools) {
            console.log(`Fetched ${data.pools.length} Uniswap V3 pools`);
            return data.pools.map(pool => ({
                id: pool.id,
                pair: `${pool.token0.symbol}/${pool.token1.symbol}`,
                dex: 'uniswap',
                version: 'V3',
                tvl: parseFloat(pool.totalValueLockedUSD || 0),
                volume24h: parseFloat(pool.volumeUSD || 0) / 7, // Rough daily estimate
                feeTier: parseInt(pool.feeTier) / 1000000,
                token0: pool.token0.symbol,
                token1: pool.token1.symbol
            }));
        }
    } catch (error) {
        console.error('Failed to fetch Uniswap V3:', error.message);
    }
    
    return [];
}

// Main handler for Vercel
module.exports = async (req, res) => {
    // Enable CORS
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
            // Check cache first
            const cacheKey = `pools_${dex}`;
            const cachedData = cache.get(cacheKey);
            
            if (cachedData && cachedData.length > 0) {
                console.log(`Returning ${cachedData.length} cached pools for ${dex}`);
                return res.status(200).json({
                    success: true,
                    data: cachedData,
                    cached: true,
                    timestamp: new Date().toISOString()
                });
            }
            
            console.log(`Fetching fresh data for ${dex}...`);
            let allPools = [];
            
            // Fetch based on selection
            if (dex === 'all' || dex === 'pancakeswap') {
                // Try multiple PancakeSwap endpoints
                const [v2Pools, v3Pools] = await Promise.all([
                    fetchPancakeSwapV2(),
                    fetchPancakeSwapV3()
                ]);
                
                allPools = allPools.concat(v2Pools, v3Pools);
                console.log(`Total PancakeSwap pools: ${v2Pools.length + v3Pools.length}`);
            }
            
            if (dex === 'all' || dex === 'uniswap') {
                // Try multiple Uniswap endpoints
                const [v2Pools, v3Pools] = await Promise.all([
                    fetchUniswapV2(),
                    fetchUniswapV3()
                ]);
                
                allPools = allPools.concat(v2Pools, v3Pools);
                console.log(`Total Uniswap pools: ${v2Pools.length + v3Pools.length}`);
            }
            
            // Filter out invalid pools
            allPools = allPools.filter(pool => 
                pool.tvl > 0 && 
                pool.token0 && 
                pool.token1 &&
                pool.token0 !== pool.token1
            );
            
            // Calculate APR for all pools
            const poolsWithAPR = allPools.map(pool => {
                const fees24h = pool.volume24h * pool.feeTier;
                const feeApr = pool.tvl > 0 ? (fees24h * 365 / pool.tvl) * 100 : 0;
                
                return {
                    ...pool,
                    fees24h: fees24h,
                    feeApr: feeApr,
                    apr: feeApr // Could be adjusted with IL calculations
                };
            });
            
            // Sort by APR descending
            poolsWithAPR.sort((a, b) => b.apr - a.apr);
            
            // Cache only if we got data
            if (poolsWithAPR.length > 0) {
                cache.set(cacheKey, poolsWithAPR);
                console.log(`Cached ${poolsWithAPR.length} pools for ${dex}`);
            }
            
            return res.status(200).json({
                success: true,
                data: poolsWithAPR,
                cached: false,
                count: poolsWithAPR.length,
                timestamp: new Date().toISOString()
            });
            
        } catch (error) {
            console.error('API Error:', error);
            return res.status(200).json({
                success: true,
                data: [],
                error: error.message,
                message: 'Failed to fetch pools from The Graph. They might be rate limiting or down.',
                timestamp: new Date().toISOString()
            });
        }
    }
    
    // 404 for unknown endpoints
    return res.status(404).json({
        error: 'Endpoint not found',
        available: [
            '/api/health',
            '/api/pools/all',
            '/api/pools/pancakeswap',
            '/api/pools/uniswap',
            '/api/cache/clear'
        ]
    });
};
