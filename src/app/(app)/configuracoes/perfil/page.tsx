import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { getRenderProfile } from "@/server/auth";
import { getMyPhoto } from "@/server/files";
import { getMyProfileDetails } from "@/server/profiles";
import { NicknameForm } from "./nickname-form";
import { PhotoEditor } from "./photo-editor";

export const metadata: Metadata = {
  title: "Perfil · GoRolê",
};

async function ProfileContent() {
  const profile = await getRenderProfile();
  const [details, photo] = await Promise.all([getMyProfileDetails(profile.personId), getMyPhoto(profile.personId)]);

  return (
    <div className="flex flex-col gap-6">
      <section className="card-surface p-6">
        <PhotoEditor name={details.nickname ?? details.displayName} photo={photo} />
      </section>
      <section className="card-surface flex flex-col gap-4 p-6">
        <NicknameForm current={details.nickname} firstName={details.displayName.trim().split(/\s+/)[0] ?? details.displayName} />
      </section>
      <section className="card-surface flex flex-col gap-2 p-6 text-sm">
        <h2 className="text-lg font-bold">Seus dados</h2>
        <p>
          <span className="text-muted-foreground">Nome:</span> {details.displayName}
        </p>
        <p>
          <span className="text-muted-foreground">Telefone:</span> {details.phone}
        </p>
        <p className="text-xs text-muted-foreground">O telefone é o que identifica você nos rolês e só você o vê aqui. Para trocar, fale com o administrador.</p>
      </section>
    </div>
  );
}

export default function ProfilePage() {
  return (
    <>
      <PageHeader title="Perfil" description="Sua foto e como você quer ser chamado." backHref="/configuracoes" />
      <Suspense fallback={null}>
        <ProfileContent />
      </Suspense>
    </>
  );
}
