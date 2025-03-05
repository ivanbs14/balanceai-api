import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import * as bcrypt from "bcrypt";
import { PrismaService } from "src/prisma-services/prisma.service";

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    name: string,
    document: string,
    email: string,
    password: string,
    role: string,
  ) {
    const existingUserByEmail = await this.prisma.user.findUnique({
      where: { email },
    });
    if (existingUserByEmail) {
      throw new BadRequestException("E-mail já cadastrado");
    }

    const existingUserByDocument = await this.prisma.user.findUnique({
      where: { document },
    });
    if (existingUserByDocument) {
      throw new BadRequestException("Documento já cadastrado");
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await this.prisma.user.create({
      data: { name, document, email, password: hashedPassword, role },
    });

    return { message: "Usuário criado com sucesso", userId: user.id };
  }

  async getAll() {
    return this.prisma.user.findMany();
  }

  async getById(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException("Usuário não encontrado");
    }
    return user;
  }

  async update(
    id: string,
    data: Partial<{
      name: string;
      document: string;
      email: string;
      password: string;
      role: string;
    }>,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException("Usuário não encontrado");
    }

    if (data.password) {
      data.password = await bcrypt.hash(data.password, 10);
    }

    return this.prisma.user.update({ where: { id }, data });
  }

  async delete(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException("Usuário não encontrado");
    }
    await this.prisma.user.delete({ where: { id } });
    return { message: "Usuário deletado com sucesso" };
  }
}
