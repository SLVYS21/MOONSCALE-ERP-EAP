import { Injectable, NotFoundException, ConflictException } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import { WikiPage, WikiPageDocument } from './schemas/wiki-page.schema'

function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 80)
}

@Injectable()
export class WikiService {
  constructor(@InjectModel(WikiPage.name) private wikiModel: Model<WikiPageDocument>) {}

  async getTree() {
    const pages = await this.wikiModel
      .find({ isPublished: true })
      .select('title slug icon parentId order')
      .sort({ order: 1 })
      .lean()
    return this.buildTree(pages)
  }

  async getPage(slug: string) {
    const page = await this.wikiModel.findOne({ slug }).lean()
    if (!page) throw new NotFoundException('Page introuvable')
    return page
  }

  async createPage(data: {
    title: string
    content?: string
    parentId?: string
    icon?: string
    createdById: string
  }) {
    let slug = slugify(data.title)
    const existing = await this.wikiModel.findOne({ slug })
    if (existing) slug = `${slug}-${Date.now()}`

    const siblings = await this.wikiModel.countDocuments({ parentId: data.parentId ?? null })

    return this.wikiModel.create({
      title: data.title,
      slug,
      content: data.content ?? '',
      parentId: data.parentId ? new Types.ObjectId(data.parentId) : null,
      icon: data.icon ?? '📄',
      order: siblings,
      createdBy: new Types.ObjectId(data.createdById),
      isPublished: true,
    })
  }

  async updatePage(
    slug: string,
    data: { title?: string; content?: string; icon?: string; parentId?: string | null },
    updatedById: string,
  ) {
    const page = await this.wikiModel.findOne({ slug })
    if (!page) throw new NotFoundException('Page introuvable')

    if (data.title !== undefined) page.title = data.title
    if (data.content !== undefined) page.content = data.content
    if (data.icon !== undefined) page.icon = data.icon
    if (data.parentId !== undefined) {
      page.parentId = data.parentId ? new Types.ObjectId(data.parentId) : null
    }
    page.updatedBy = new Types.ObjectId(updatedById)

    return page.save()
  }

  async deletePage(slug: string) {
    const page = await this.wikiModel.findOne({ slug })
    if (!page) throw new NotFoundException('Page introuvable')
    await this.wikiModel.deleteOne({ _id: page._id })
    // Supprimer les enfants en cascade
    await this.wikiModel.deleteMany({ parentId: page._id })
    return { deleted: true }
  }

  async reorderPages(updates: Array<{ id: string; order: number }>) {
    await Promise.all(
      updates.map(({ id, order }) =>
        this.wikiModel.findByIdAndUpdate(id, { order }),
      ),
    )
    return { reordered: true }
  }

  private buildTree(pages: WikiPageDocument[]) {
    type TreeNode = WikiPageDocument & { children: TreeNode[] }
    const map = new Map<string, TreeNode>()
    const roots: TreeNode[] = []

    for (const p of pages) {
      map.set(p._id.toString(), { ...p, children: [] } as unknown as TreeNode)
    }
    for (const p of pages) {
      const node = map.get(p._id.toString())!
      const parentId = (p.parentId as Types.ObjectId | null)?.toString()
      if (parentId && map.has(parentId)) {
        map.get(parentId)!.children.push(node)
      } else {
        roots.push(node)
      }
    }
    return roots
  }
}
