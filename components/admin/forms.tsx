import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes
} from "react";

export function AdminPageShell(props: { children: ReactNode }) {
  return <main className="mx-auto w-full max-w-7xl px-6 py-8">{props.children}</main>;
}

export function PageHeader(props: {
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 border-b border-slate-200 pb-6 md:flex-row md:items-end md:justify-between">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
          {props.title}
        </h1>
        <p className="max-w-3xl text-sm text-slate-600">{props.description}</p>
      </div>
      {props.actions ? <div>{props.actions}</div> : null}
    </div>
  );
}

export function SectionCard(props: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-slate-950">{props.title}</h2>
        {props.description ? (
          <p className="text-sm text-slate-600">{props.description}</p>
        ) : null}
      </div>
      {props.children ? <div className="mt-4 space-y-4">{props.children}</div> : null}
    </section>
  );
}

export function Notice(props: {
  kind: "success" | "error";
  children: ReactNode;
}) {
  const className =
    props.kind === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : "border-rose-200 bg-rose-50 text-rose-800";

  return (
    <div className={`rounded-xl border px-4 py-3 text-sm ${className}`}>
      {props.children}
    </div>
  );
}

export function FormGrid(props: { children: ReactNode }) {
  return <div className="grid gap-4 md:grid-cols-2">{props.children}</div>;
}

export function Field(props: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <label
        className="block text-sm font-medium text-slate-800"
        htmlFor={props.htmlFor}
      >
        {props.label}
      </label>
      {props.children}
      {props.hint ? <p className="text-xs text-slate-500">{props.hint}</p> : null}
    </div>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={[
        "w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200",
        props.className ?? ""
      ].join(" ")}
    />
  );
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={[
        "min-h-28 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200",
        props.className ?? ""
      ].join(" ")}
    />
  );
}

export function SelectInput(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={[
        "w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200",
        props.className ?? ""
      ].join(" ")}
    />
  );
}

export function Pill(props: { children: ReactNode }) {
  return (
    <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700">
      {props.children}
    </span>
  );
}
