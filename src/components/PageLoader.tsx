export default function PageLoader({ label = 'טוען…' }: { label?: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="text-center">
        <div className="inline-block h-12 w-12 animate-spin rounded-full border-4 border-solid border-slate-300 border-r-slate-900" />
        <p className="mt-4 text-slate-900 font-medium">{label}</p>
      </div>
    </div>
  );
}

