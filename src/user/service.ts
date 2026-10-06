import {
  BadRequestException,
  ForbiddenException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import * as bcrypt from "bcrypt";
import { PrismaService } from "../prisma-services/prisma.service";
import { UpdateUserDto } from "./dto/updated.dto";
import { AuthUser } from "../auth/auth.types";

const PROFILE_SELECT = {
  id: true,
  name: true,
  document: true,
  email: true,
  role: true,
  createdAt: true,
} as const;

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    name: string,
    document: string,
    email: string,
    password: string,
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
      data: { name, document, email, password: hashedPassword, role: "user" },
    });

    return { message: "Usuário criado com sucesso", userId: user.id };
  }

  private assertOwner(id: string, authenticatedId: string) {
    if (!authenticatedId || id !== authenticatedId) {
      throw new ForbiddenException("Acesso permitido apenas à própria conta");
    }
  }

  async getAll() {
    throw new ForbiddenException("Listagem de usuários indisponível");
  }

  async getById(id: string, authenticatedId: string) {
    this.assertOwner(id, authenticatedId);
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: PROFILE_SELECT,
    });
    if (!user) throw new NotFoundException("Usuário não encontrado");
    return user;
  }

  async getAuthUserById(id: string): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
    });
    if (!user) {
      throw new NotFoundException("Usuário não encontrado");
    }
    return user;
  }

  async update(id: string, data: UpdateUserDto, authenticatedId: string) {
    this.assertOwner(id, authenticatedId);
    const changes: {
      name?: string;
      document?: string;
      email?: string;
      password?: string;
    } = {};
    for (const key of ["name", "document", "email"] as const) {
      if (data[key] !== undefined) changes[key] = data[key];
    }
    if (data.password === undefined && Object.keys(changes).length === 0) {
      throw new BadRequestException(
        "Informe um campo de perfil ou uma nova senha",
      );
    }
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, password: true },
    });
    if (!user) throw new NotFoundException("Usuário não encontrado");
    if (data.password !== undefined) {
      if (!data.currentPassword)
        throw new BadRequestException("Informe a senha atual");
      if (!user.password || !(await bcrypt.compare(data.currentPassword, user.password))) {
        throw new ForbiddenException("Senha atual incorreta");
      }
      changes.password = await bcrypt.hash(data.password, 10);
    }
    try {
      return await this.prisma.user.update({
        where: { id },
        data: changes,
        select: PROFILE_SELECT,
      });
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "P2002"
      ) {
        throw new ConflictException("E-mail ou documento já cadastrado");
      }
      throw error;
    }
  }

  async delete(id: string, authenticatedId: string) {
    this.assertOwner(id, authenticatedId);
    throw new ForbiddenException(
      "Exclusão de conta indisponível até definição da política de retenção",
    );
  }
}
