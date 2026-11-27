export function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div aria-hidden className="flex flex-col gap-2">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="card-surface h-14 animate-pulse" />
      ))}
    </div>
  );
}
