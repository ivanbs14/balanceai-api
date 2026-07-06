import { IsString, Matches } from 'class-validator';

export class CreateAIFeedbackDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}$/, {
    message: 'competence must be in YYYY-MM format',
  })
  competence: string;
}
