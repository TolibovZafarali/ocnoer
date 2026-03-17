/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type AdminCardContentProps = {
  title: string;
  eyebrow?: string;
  description?: ReactNode;
  media?: ReactNode;
  footer?: ReactNode;
};

type AdminCardProps = AdminCardContentProps & {
  className?: string;
};

type AdminLinkCardProps = AdminCardContentProps & {
  href: string;
  className?: string;
};

function AdminCardContent(props: AdminCardContentProps) {
  return (
    <>
      {props.media ? (
        <div className="mb-4 overflow-hidden rounded-2xl">{props.media}</div>
      ) : null}
      <div className="space-y-2">
        {props.eyebrow ? (
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
            {props.eyebrow}
          </p>
        ) : null}
        <h2 className="text-lg font-semibold text-slate-950">{props.title}</h2>
        {props.description ? (
          <div className="text-sm leading-6 text-slate-600">
            {props.description}
          </div>
        ) : null}
      </div>
      {props.footer ? (
        <div className="mt-4 flex flex-wrap gap-2">{props.footer}</div>
      ) : null}
    </>
  );
}

export function AdminCardGrid(props: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid gap-5 md:grid-cols-2 xl:grid-cols-3",
        props.className
      )}
    >
      {props.children}
    </div>
  );
}

export function AdminCard(props: AdminCardProps) {
  return (
    <section
      className={cn(
        "rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm",
        props.className
      )}
    >
      <AdminCardContent
        title={props.title}
        eyebrow={props.eyebrow}
        description={props.description}
        media={props.media}
        footer={props.footer}
      />
    </section>
  );
}

export function AdminLinkCard(props: AdminLinkCardProps) {
  return (
    <Link
      href={props.href}
      className={cn(
        "block rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300",
        props.className
      )}
    >
      <AdminCardContent
        title={props.title}
        eyebrow={props.eyebrow}
        description={props.description}
        media={props.media}
        footer={props.footer}
      />
    </Link>
  );
}

export function AdminEmptyState(props: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <section className="rounded-[28px] border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
      <div className="mx-auto max-w-2xl space-y-3">
        <h2 className="text-xl font-semibold text-slate-950">{props.title}</h2>
        <p className="text-sm leading-6 text-slate-600">{props.description}</p>
        {props.action ? <div className="pt-2">{props.action}</div> : null}
      </div>
    </section>
  );
}
