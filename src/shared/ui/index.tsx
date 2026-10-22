import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...values: ClassValue[]) { return twMerge(clsx(values)); }
const buttonVariants = cva('pc-button inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50', {
  variants: { variant: { default: 'bg-brand text-white hover:bg-emerald-800', outline: 'border border-slate-200 bg-white text-ink hover:bg-slate-50' } },
  defaultVariants: { variant: 'default' },
});
export function Button({ className, variant, asChild = false, type = 'button', ...props }: React.ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Component = asChild ? Slot : 'button';
  return <Component {...(!asChild ? { type } : {})} className={cn(buttonVariants({ variant }), className)} {...props} />;
}
export function Card({ className, ...props }: React.ComponentProps<'section'>) {
  return <section className={cn('pc-card rounded-2xl border border-slate-200 bg-white p-6', className)} {...props} />;
}
export function Input({ className, ...props }: React.ComponentProps<'input'>) {
  return <input className={cn('pc-input w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm disabled:opacity-50', className)} {...props} />;
}
export function Badge({ className, ...props }: React.ComponentProps<'span'>) {
  return <span className={cn('pc-badge inline-flex rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800', className)} {...props} />;
}
export { Illustration, type IllustrationKind, type IllustrationSize } from './illustration';
