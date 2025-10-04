import { IsString, Matches } from 'class-validator';

export class LinkInstallationDto {
  @IsString()
  @Matches(/^\d+$/, { message: "Installation ID must be a number" })
  installationId!: string;
}


