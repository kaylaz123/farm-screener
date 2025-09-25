# DeFi Liquidity Pool Screener

Real-time APR calculator for PancakeSwap & Uniswap liquidity pools.

## Features
- ✅ Real-time APR calculation
- ✅ Support for PancakeSwap V2/V3 & Uniswap V2/V3
- ✅ Advanced filtering (TVL, Volume, APR)
- ✅ Export to CSV
- ✅ Auto-refresh capability
- ✅ Cached data (5 minutes TTL)

## Tech Stack
- Frontend: Vanilla JavaScript + HTML5
- Backend: Node.js + Vercel Functions
- Data Source: The Graph Protocol
- Deployment: Vercel

## Live Demo
[https://your-app.vercel.app](https://your-app.vercel.app)

## Local Development
```bash
npm install
vercel dev
```

## Deployment
```bash
vercel --prod
```

## API Endpoints
- GET `/api/health` - Health check
- GET `/api/pools/all` - Get all pools
- GET `/api/pools/pancakeswap` - Get PancakeSwap pools
- GET `/api/pools/uniswap` - Get Uniswap pools
- POST `/api/cache/clear` - Clear cache

## License
MIT
