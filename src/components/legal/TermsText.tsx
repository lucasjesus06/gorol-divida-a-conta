import { termsSections } from "@/content/terms";

export function TermsText() {
  return (
    <div className="flex flex-col gap-5 text-sm">
      {termsSections.map((section) => (
        <section key={section.title} className="flex flex-col gap-2">
          <h2 className="text-base font-bold">{section.title}</h2>
          {section.paragraphs.map((paragraph) => (
            <p key={paragraph} className="text-muted-foreground">
              {paragraph}
            </p>
          ))}
        </section>
      ))}
    </div>
  );
}
