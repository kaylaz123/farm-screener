// =====================================
// 3. api/index.js (Backend API untuk Vercel)
// =====================================
const axios = require('axios');
const NodeCache = require('node-cache');

// Cache dengan TTL 5 menit
const cache = new NodeCache({ stdTTL: 300 });

// API Configuration
const API_CONFIG = {
    pancakeswap: {
        v3: 'https://api.thegraph.com/subgraphs/name/pancakeswap/exchange-v3-bsc',
        v2: 'https://api.thegraph.com/subgraphs/name/pancakeswap/exchange-v2'
    },
    uniswap: {
        v3: 'https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3',
        v2: 'https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v2'
    }
};

// Helper function untuk GraphQL request
async function graphQLRequest(url, query) {
    try {
        const response = await axios.post(url, {
            query: query
        }, {
            headers: {
                'Content-Type': 'application/json',
            }
        });
        return response.data;
    } catch (error) {
        console.error(`GraphQL Error for ${url}:`, error.message);
        throw error;
    }
}

// Fetch PancakeSwap pools
async function fetchPancakeSwapPools() {
    const cacheKey = 'pancakeswap_pools';
    const cached = cache.get(cacheKey);
    
    if (cached) {
        console.log('Returning cached PancakeSwap data');
        return cached;
    }
    
    const queryV3 = `{
        pools(first: 100, orderBy: totalValueLockedUSD, orderDirection: desc, where: {totalValueLockedUSD_gt: "50000"}) {
            id
            token0 { symbol, decimals }
            token1 { symbol, decimals }
            totalValueLockedUSD
            volumeUSD
            feeTier
            poolDayData(first: 1, orderBy: date, orderDirection: desc) {
                volumeUSD
                feesUSD
                tvlUSD
            }
        }
    }`;
    
    const queryV2 = `{
        pairs(first: 100, orderBy: reserveUSD, orderDirection: desc, where: {reserveUSD_gt: "50000"}) {
            id
            token0 { symbol }
            token1 { symbol }
            reserveUSD
            volumeUSD
            pairDayDatas(first: 1, orderBy: date, orderDirection: desc) {
                dailyVolumeUSD
                reserveUSD
            }
        }
    }`;
    
    let pools = [];
    
    try {
        const dataV3 = await graphQLRequest(API_CONFIG.pancakeswap.v3, queryV3);
        if (dataV3.data && dataV3.data.pools) {
            pools = pools.concat(dataV3.data.pools.map(pool => ({
                id: pool.id,
                pair: `${pool.token0.symbol}/${pool.token1.symbol}`,
                dex: 'pancakeswap',
                tvl: parseFloat(pool.totalValueLockedUSD || 0),
                volume24h: pool.poolDayData && pool.poolDayData[0] 
                    ? parseFloat(pool.poolDayData[0].volumeUSD || 0)
                    : parseFloat(pool.volumeUSD || 0),
                feeTier: parseInt(pool.feeTier) / 1000000,
                token0: pool.token0.symbol,
                token1: pool.token1.symbol,
                version: 'V3'
            })));
        }
    } catch (error) {
        console.error('Error fetching PancakeSwap V3:', error.message);
    }
    
    try {
        const dataV2 = await graphQLRequest(API_CONFIG.pancakeswap.v2, queryV2);
        if (dataV2.data && dataV2.data.pairs) {
            pools = pools.concat(dataV2.data.pairs.map(pair => ({
                id: pair.id,
                pair: `${pair.token0.symbol}/${pair.token1.symbol}`,
                dex: 'pancakeswap',
                tvl: parseFloat(pair.reserveUSD || 0),
                volume24h: pair.pairDayDatas && pair.pairDayDatas[0]
                    ? parseFloat(pair.pairDayDatas[0].dailyVolumeUSD || 0)
                    : 0,
                feeTier: 0.0025,
                token0: pair.token0.symbol,
                token1: pair.token1.symbol,
                version: 'V2'
            })));
        }
    } catch (error) {
        console.error('Error fetching PancakeSwap V2:', error.message);
    }
    
    cache.set(cacheKey, pools);
    return pools;
}

// Fetch Uniswap pools
async function fetchUniswapPools() {
    const cacheKey = 'uniswap_pools';
    const cached = cache.get(cacheKey);
    
    if (cached) {
        console.log('Returning cached Uniswap data');
        return cached;
    }
    
    const queryV3 = `{
        pools(first: 100, orderBy: totalValueLockedUSD, orderDirection: desc, where: {totalValueLockedUSD_gt: "100000"}) {
            id
            token0 { symbol, decimals }
            token1 { symbol, decimals }
            totalValueLockedUSD
            volumeUSD
            feeTier
            poolDayData(first: 1, orderBy: date, orderDirection: desc) {
                volumeUSD
                feesUSD
                tvlUSD
            }
        }
    }`;
    
    const queryV2 = `{
        pairs(first: 100, orderBy: reserveUSD, orderDirection: desc, where: {reserveUSD_gt: "100000"}) {
            id
            token0 { symbol }
            token1 { symbol }
            reserveUSD
            volumeUSD
            pairDayDatas(first: 1, orderBy: date, orderDirection: desc) {
                dailyVolumeUSD
                reserveUSD
            }
        }
    }`;
    
    let pools = [];
    
    try {
        const dataV3 = await graphQLRequest(API_CONFIG.uniswap.v3, queryV3);
        if (dataV3.data && dataV3.data.pools) {
            pools = pools.concat(dataV3.data.pools.map(pool => ({
                id: pool.id,
                pair: `${pool.token0.symbol}/${pool.token1.symbol}`,
                dex: 'uniswap',
                tvl: parseFloat(pool.totalValueLockedUSD || 0),
                volume24h: pool.poolDayData && pool.poolDayData[0]
                    ? parseFloat(pool.poolDayData[0].volumeUSD || 0)
                    : parseFloat(pool.volumeUSD || 0),
                feeTier: parseInt(pool.feeTier) / 1000000,
                token0: pool.token0.symbol,
                token1: pool.token1.symbol,
                version: 'V3'
            })));
        }
    } catch (error) {
        console.error('Error fetching Uniswap V3:', error.message);
    }
    
    try {
        const dataV2 = await graphQLRequest(API_CONFIG.uniswap.v2, queryV2);
        if (dataV2.data && dataV2.data.pairs) {
            pools = pools.concat(dataV2.data.pairs.map(pair => ({
                id: pair.id,
                pair: `${pair.token0.symbol}/${pair.token1.symbol}`,
                dex: 'uniswap',
                tvl: parseFloat(pair.reserveUSD || 0),
                volume24h: pair.pairDayDatas && pair.pairDayDatas[0]
                    ? parseFloat(pair.pairDayDatas[0].dailyVolumeUSD || 0)
                    : 0,
                feeTier: 0.003,
                token0: pair.token0.symbol,
                token1: pair.token1.symbol,
                version: 'V2'
            })));
        }
    } catch (error) {
        console.error('Error fetching Uniswap V2:', error.message);
    }
    
    cache.set(cacheKey, pools);
    return pools;
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
    
    const { pathname, searchParams } = new URL(req.url, `http://${req.headers.host}`);
    
    // Health check
    if (pathname === '/api/health') {
        return res.status(200).json({
            status: 'healthy',
            cache: cache.getStats(),
            timestamp: new Date().toISOString()
        });
    }
    
    // Get pools
    if (pathname.startsWith('/api/pools/')) {
        const dex = pathname.split('/').pop();
        
        try {
            let pools = [];
            
            if (dex === 'all' || dex === 'pancakeswap') {
                const pancakePools = await fetchPancakeSwapPools();
                pools = pools.concat(pancakePools);
            }
            
            if (dex === 'all' || dex === 'uniswap') {
                const uniswapPools = await fetchUniswapPools();
                pools = pools.concat(uniswapPools);
            }
            
            // Calculate APR
            const poolsWithAPR = pools.map(pool => {
                const fees24h = pool.volume24h * pool.feeTier;
                const feeApr = pool.tvl > 0 ? (fees24h * 365 / pool.tvl) * 100 : 0;
                
                return {
                    ...pool,
                    fees24h,
                    feeApr,
                    apr: feeApr
                };
            });
            
            return res.status(200).json({
                success: true,
                data: poolsWithAPR,
                timestamp: new Date().toISOString()
            });
            
        } catch (error) {
            console.error('API Error:', error);
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
    
    // Clear cache
    if (pathname === '/api/cache/clear' && req.method === 'POST') {
        cache.flushAll();
        return res.status(200).json({
            success: true,
            message: 'Cache cleared'
        });
    }
    
    // Default response
    return res.status(404).json({
        error: 'Not Found',
        availableEndpoints: [
            '/api/health',
            '/api/pools/all',
            '/api/pools/pancakeswap',
            '/api/pools/uniswap',
            '/api/cache/clear (POST)'
        ]
    });
};
