'use client'

interface Column {
  key: string
  label: string
}

interface Props {
  data: Record<string, unknown>[]
  filename: string
  columns: Column[]
  label?: string
}

export default function DownloadCSV({ data, filename, columns, label = '↓ Export CSV' }: Props) {
  function handleDownload() {
    const header = columns.map(c => c.label).join(',')
    const rows = data.map(row =>
      columns.map(c => {
        const v = row[c.key]
        const str = v == null ? '' : String(v)
        return str.includes(',') || str.includes('"') || str.includes('\n')
          ? `"${str.replace(/"/g, '""')}"` : str
      }).join(',')
    )
    const csv = [header, ...rows].join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${filename}_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <button onClick={handleDownload} className="pa" title={`Download as CSV (${data.length} rows)`}>
      {label}
    </button>
  )
}
