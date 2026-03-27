export default function WatchlistLoading() {
  return (
    <div className="p-8 space-y-4">
      <div className="h-8 bg-slate-700 rounded w-36 animate-pulse" />
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="h-16 bg-slate-800 rounded-lg animate-pulse" />
      ))}
    </div>
  )
}
