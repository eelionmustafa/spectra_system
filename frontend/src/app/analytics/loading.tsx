import SkeletonCard from '@/components/SkeletonCard'

export default function AnalyticsLoading() {
  return (
    <div className="p-8 space-y-6">
      <div className="h-8 bg-slate-700 rounded w-48 animate-pulse" />
      <div className="grid grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} lines={2} />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <SkeletonCard lines={6} />
        <SkeletonCard lines={6} />
      </div>
    </div>
  )
}
