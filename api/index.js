// api/index.js - Direct query to DEX subgraphs for real data
const axios = require('axios');
const NodeCache = require('node-cache');

const cache = new NodeCache({ stdTTL: 300 });

// Subgraph endpoints
const SUBGRAPHS = {
    'uniswap-v3-ethereum': 'https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3',
    'uniswap-v3-polygon': 'https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3-polygon',
    'uniswap-v3-arbitrum': 'https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3-arbitrum',
    'uniswap-v3-optimism': 'https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3-optimism',
    'uniswap-v3-base': 'https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3-base',
    'uniswap-v3-bnb': 'https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3-bnb',
    'uniswap-v2': 'https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v2',
    'pancakeswap-v3-bsc': 'https://api.thegraph.com/subgraphs/name/pancakeswap/exchange-v3-bsc',
    'pancakeswap-v2': 'https://api.thegraph.com/subgraphs/name/pancakeswap/exchange',
    'sushiswap': 'https://api.thegraph.com/subgraphs/name/sushiswap/exchange',
};

// Query Uniswap V3 pools with real-time data
async function fetchUniswapV3Pools(chain = 'ethereum') {
    const subgraphUrl = SUBGRAPHS[`uniswap-v3-${chain}`];
    if (!subgraphUrl) return [];
    
    const query = `{
        pools(first: 200, orderBy: totalValueLockedUSD, orderDirection: desc, where: {totalValueLockedUSD_gt: "1000"}) {
            id
            token0 { symbol, decimals, derivedETH }
            token1 { symbol, decimals, derivedETH }
            feeTier
            liquidity
            totalValueLockedUSD
            totalValueLockedToken0
            totalValueLockedToken1
            volumeUSD
            feesUSD
            poolDayData(first: 7, orderBy: date, orderDirection: desc) {
                date
                volumeUSD
                feesUSD
                tvlUSD
            }
        }
    }`;
    
    try {
        const response = await axios.post(subgraphUrl, { query }, { timeout: 15000 });
        
        if (response.data && response.data.data && response.data.data.pools) {
            return response.data.data.pools.map(pool => {
                // Get latest day data
                const dayData = pool.poolDayData && pool.poolDayData[0] || {};
                const volume24h = parseFloat(dayData.volumeUSD || pool.volumeUSD || 0);
                const fees24h = parseFloat(dayData.feesUSD || pool.feesUSD || 0);
                const tvl = parseFloat(pool.totalValueLockedUSD || 0);
                
                // Calculate real APR based on fees
                const apr = tvl > 0 ? (fees24h * 365 / tvl) * 100 : 0;
                
                return {
                    id: pool.id,
                    pair: `${pool.token0.symbol}/${pool.token1.symbol}`,
                    dex: 'uniswap',
                    version: 'V3',
                    chain: chain,
                    tvl: tvl,
                    volume24h: volume24h,
                    fees24h: fees24h,
                    feeTier: parseInt(pool.feeTier) / 10000, // Convert to percentage
                    token0: pool.token0.symbol,
                    token1: pool.token1.symbol,
                    apr: apr,
                    feeApr: apr,
                    liquidity: pool.liquidity
                };
            });
        }
    } catch (error) {
        console.error(`Error fetching Uniswap V3 ${chain}:`, error.message);
    }
    
    return [];
}

// Query PancakeSwap pools
async function fetchPancakeSwapPools() {
    const queries = [
        // V3 query
        {
            url: SUBGRAPHS['pancakeswap-v3-bsc'],
            query: `{
                pools(first: 200, orderBy: totalValueLockedUSD, orderDirection: desc, where: {totalValueLockedUSD_gt: "1000"}) {
                    id
                    token0 { symbol }
                    token1 { symbol }
                    feeTier
                    totalValueLockedUSD
                    volumeUSD
                    feesUSD
                }
            }`,
            version: 'V3'
        },
        // V2 query
        {
            url: SUBGRAPHS['pancakeswap-v2'],
            query: `{
                pairs(first: 200, orderBy: reserveUSD, orderDirection: desc, where: {reserveUSD_gt: "1000"}) {
                    id
                    token0 { symbol }
                    token1 { symbol }
                    reserveUSD
                    volumeUSD
                }
            }`,
            version: 'V2'
        }
    ];
    
    let allPools = [];
    
    for (const { url, query, version } of queries) {
        try {
            const response = await axios.post(url, { query }, { timeout: 15000 });
            
            if (response.data && response.data.data) {
                const pools = response.data.data.pools || response.data.data.pairs || [];
                
                const formattedPools = pools.map(pool => {
                    const tvl = parseFloat(pool.totalValueLockedUSD || pool.reserveUSD || 0);
                    const volume24h = parseFloat(pool.volumeUSD || 0) / 7; // Rough daily estimate
                    const feeTier = version === 'V3' ? parseInt(pool.feeTier) / 10000 : 0.0025;
                    const fees24h = volume24h * feeTier;
                    const apr = tvl > 0 ? (fees24h * 365 / tvl) * 100 : 0;
                    
                    return {
                        id: pool.id,
                        pair: `${pool.token0.symbol}/${pool.token1.symbol}`,
                        dex: 'pancakeswap',
                        version: version,
                        chain: 'bsc',
                        tvl: tvl,
                        volume24h: volume24h,
                        fees24h: fees24h,
                        feeTier: feeTier,
                        token0: pool.token0.symbol,
                        token1: pool.token1.symbol,
                        apr: apr,
                        feeApr: apr
                    };
                });
                
                allPools = allPools.concat(formattedPools);
            }
        } catch (error) {
            console.error(`Error fetching PancakeSwap ${version}:`, error.message);
        }
    }
    
    return allPools;
}

// Combine with DeFi Llama for additional APR data
async function enrichWithDefiLlama(pools) {
    try {
        const response = await axios.get('https://yields.llama.fi/pools', {
            timeout: 20000,
            headers: { 'Accept': 'application/json' }
        });
        
        if (response.data && response.data.data) {
            const defiLlamaPools = response.data.data;
            
            // Create a map for quick lookup
            const llamaMap = new Map();
            defiLlamaPools.forEach(pool => {
                // Try to match by symbol and project
                const key = `${pool.symbol}-${pool.project}`.toLowerCase();
                llamaMap.set(key, pool);
            });
            
            // Enrich our pools with DeFi Llama APR data
            return pools.map(pool => {
                const key1 = `${pool.pair.replace('/', '-')}-${pool.dex}`.toLowerCase();
                const key2 = `${pool.token0}-${pool.token1}-${pool.dex}`.toLowerCase();
                
                const llamaPool = llamaMap.get(key1) || llamaMap.get(key2);
                
                if (llamaPool) {
                    // Use DeFi Llama APR if it's higher (includes rewards)
                    const llamaApr = llamaPool.apy || llamaPool.apyBase || 0;
                    if (llamaApr > pool.apr) {
                        pool.apr = llamaApr;
                        pool.apyReward = llamaPool.apyReward || 0;
                    }
                }
                
                return pool;
            });
        }
    } catch (error) {
        console.error('Error enriching with DeFi Llama:', error.message);
    }
    
    return pools;
}

// Main handler
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
        const dex = pathname.split('/').pop().toLowerCase();
        const chain = url.searchParams.get('chain')?.toLowerCase() || 'all';
        
        try {
            // Check cache
            const cacheKey = `pools_${dex}_${chain}`;
            const cachedData = cache.get(cacheKey);
            
            if (cachedData && cachedData.length > 0) {
                return res.status(200).json({
                    success: true,
                    data: cachedData,
                    cached: true,
                    count: cachedData.length,
                    timestamp: new Date().toISOString()
                });
            }
            
            let allPools = [];
            
            // Fetch based on DEX selection
            if (dex === 'all' || dex === 'uniswap') {
                // Fetch from multiple Uniswap chains
                const chains = chain === 'all' 
                    ? ['ethereum', 'polygon', 'arbitrum', 'optimism', 'base', 'bnb']
                    : [chain === 'eth' ? 'ethereum' : chain];
                
                for (const c of chains) {
                    const uniPools = await fetchUniswapV3Pools(c);
                    allPools = allPools.concat(uniPools);
                }
            }
            
            if (dex === 'all' || dex === 'pancakeswap') {
                if (chain === 'all' || chain === 'bsc') {
                    const pancakePools = await fetchPancakeSwapPools();
                    allPools = allPools.concat(pancakePools);
                }
            }
            
            // Enrich with DeFi Llama data for better APR
            allPools = await enrichWithDefiLlama(allPools);
            
            // Filter by chain if needed
            if (chain !== 'all') {
                allPools = allPools.filter(pool => pool.chain === chain);
            }
            
            // Sort by APR
            allPools.sort((a, b) => b.apr - a.apr);
            
            // Cache results
            if (allPools.length > 0) {
                cache.set(cacheKey, allPools);
            }
            
            return res.status(200).json({
                success: true,
                data: allPools,
                cached: false,
                count: allPools.length,
                source: 'subgraph+defillama',
                timestamp: new Date().toISOString()
            });
            
        } catch (error) {
            console.error('Error:', error.message);
            
            // Fallback to DeFi Llama only
            try {
                const response = await axios.get('https://yields.llama.fi/pools', {
                    timeout: 20000
                });
                
                if (response.data && response.data.data) {
                    let pools = response.data.data
                        .filter(p => p.tvlUsd > 1000)
                        .map(p => ({
                            id: p.pool,
                            pair: p.symbol,
                            dex: p.project.toLowerCase(),
                            chain: p.chain.toLowerCase(),
                            tvl: p.tvlUsd,
                            volume24h: p.volumeUsd1d || 0,
                            apr: p.apy || p.apyBase || 0,
                            feeApr: p.apyBase || 0,
                            fees24h: 0
                        }));
                    
                    // Filter by DEX
                    if (dex !== 'all') {
                        pools = pools.filter(p => p.dex.includes(dex));
                    }
                    
                    // Sort and return
                    pools.sort((a, b) => b.apr - a.apr);
                    
                    return res.status(200).json({
                        success: true,
                        data: pools.slice(0, 500),
                        source: 'defillama-fallback',
                        count: pools.length,
                        timestamp: new Date().toISOString()
                    });
                }
            } catch (fallbackError) {
                console.error('Fallback error:', fallbackError.message);
            }
            
            return res.status(200).json({
                success: false,
                data: [],
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }
    
    return res.status(404).json({
        error: 'Not found'
    });
};
