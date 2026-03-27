import SkeletonCard from '@/components/SkeletonCard'

export default function PortfolioLoading() {
  return (
    <div className="p-8 space-y-6">
      <div className="h-8 bg-slate-700 rounded w-44 animate-pulse" />
      <div className="grid grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i} lines={3} />
        ))}
      </div>
    </div>
  )
}
