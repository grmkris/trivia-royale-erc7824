import type { ReactNode } from 'react';

interface Param {
  name: string;
  type: string;
}

interface MethodDetailsProps {
  name: string;
  description: string;
  params?: Param[];
  returns: string;
  example: string;
}

export function MethodDetails({
  name,
  description,
  params = [],
  returns,
  example,
}: MethodDetailsProps) {
  return (
    <div className="border rounded-lg p-6 my-6 bg-fd-card">
      <h4 className="text-lg font-semibold mb-3 font-mono text-fd-primary">
        {name}
      </h4>

      <p className="text-fd-muted-foreground mb-4">{description}</p>

      {params.length > 0 && (
        <div className="mb-4">
          <h5 className="text-sm font-semibold mb-2 text-fd-foreground">Parameters:</h5>
          <ul className="space-y-1">
            {params.map((param, index) => (
              <li key={index} className="text-sm">
                <code className="text-fd-accent-foreground bg-fd-muted px-1.5 py-0.5 rounded">
                  {param.name}
                </code>
                <span className="text-fd-muted-foreground"> : </span>
                <code className="text-fd-accent-foreground bg-fd-muted px-1.5 py-0.5 rounded">
                  {param.type}
                </code>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mb-4">
        <h5 className="text-sm font-semibold mb-2 text-fd-foreground">Returns:</h5>
        <code className="text-sm text-fd-accent-foreground bg-fd-muted px-2 py-1 rounded block w-fit">
          {returns}
        </code>
      </div>

      <div>
        <h5 className="text-sm font-semibold mb-2 text-fd-foreground">Example:</h5>
        <pre className="bg-fd-muted p-3 rounded overflow-x-auto">
          <code className="text-sm">{example}</code>
        </pre>
      </div>
    </div>
  );
}
