import { saveCategoryAction } from "@/app/actions/staff";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, Notice, PageHeader } from "@/components/ui-app";
import { requireUser } from "@/lib/auth";
import { listCategories } from "@/lib/domain";
import { getDictionary } from "@/lib/locale";

export default async function CategoriesPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireUser(["super_admin"]);
  const { dict } = await getDictionary();
  const params = await searchParams;
  const categories = await listCategories();
  return (
    <div>
      <PageHeader title={dict.nav.categories} />
      <Notice error text={params.error ? dict.errors[params.error as keyof typeof dict.errors] || dict.errors.generic : ""} />
      <ul className="mb-6 grid gap-2">{categories.map((category) => <li key={category.id} className="rounded-xl bg-card px-4 py-3 ring-1 ring-foreground/10">{category.nameEn} · {category.nameAm} · {category.nameOm}</li>)}</ul>
      <form action={saveCategoryAction} className="grid max-w-xl gap-3">
        <Field label={dict.common.code}><Input name="code" required className="h-11" /></Field>
        <Field label="English"><Input name="nameEn" required className="h-11" /></Field>
        <Field label="አማርኛ"><Input name="nameAm" className="h-11" /></Field>
        <Field label="Afaan Oromoo"><Input name="nameOm" className="h-11" /></Field>
        <Field label={dict.common.description}><Input name="descriptionEn" className="h-11" /></Field>
        <Button type="submit" className="h-11 w-fit">{dict.common.create}</Button>
      </form>
    </div>
  );
}
