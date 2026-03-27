import SkeletonCard from '@/components/SkeletonCard'

export default function ClientsLoading() {
  return (
    <div className="p-8 space-y-4">
      <div className="h-8 bg-slate-700 rounded w-40 animate-pulse" />
      <div className="h-10 bg-slate-700 rounded animate-pulse" />
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="h-14 bg-slate-800 rounded-lg animate-pulse" />
      ))}
    </div>
  )
}
