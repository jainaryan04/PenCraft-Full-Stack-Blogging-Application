import { Prisma, PrismaClient } from "@prisma/client/edge";
import { withAccelerate } from "@prisma/extension-accelerate";
import { Hono } from "hono";
import { sign, verify } from "hono/jwt";
import { createPostInput, updatePost } from "@akshitlakhera/common-zod-app";
export const blogRouter = new Hono<{
  Bindings: {
    DATABASE_URL: string;
    JWT_SECRET: string;
  };
  Variables: {
    userId: string;
  };
}>();
// Middleware
// My first goal is to check these middleware calls why there are giving errors.
// The * character in the route pattern /api/v1/blog/* acts as a wildcard.
blogRouter.use(async (c, next) => {
  try {
    const jwt = c.req.header("Authorization");
    if (!jwt) {
      c.status(401);
      return c.json({ error: "Unauthorized" });
    }
    const token = jwt.split(" ")[1]; // Corrected token split
    const payload = await verify(token, c.env.JWT_SECRET);
    if (!payload) {
      c.status(401);
      return c.json({ error: "Unauthorized" });
    }
    c.set("userId", payload.id);
    await next();
  } catch (error) {
    console.error("Error verifying JWT token:", error);
    c.status(401);
    return c.json({ error: "Unauthorized" });
  }
});
// Routing
// Routing
blogRouter.post("/", async (c) => {
  try {
    const userId = c.get("userId");
    console.log("userId:", userId); // Log userId for debugging

    const prisma = new PrismaClient({
      datasourceUrl: c.env.DATABASE_URL,
    }).$extends(withAccelerate());

    const body = await c.req.json();
    // zod check
    const { success } = createPostInput.safeParse(body);
    if (!success) {
      c.status(400);
      return c.json({ error: "invalid input" });
    }
    const blog = await prisma.post.create({
      data: {
        title: body.title,
        content: body.content,
        authorId: userId, //blog get saved with specific userId (payload one) automatically
      },
    });

    return c.json({
      id: blog.id,
    });
  } catch (error) {
    console.error("Error creating blog:", error);
    c.status(500); // Internal Server Error
    return c.json({ error: "Internal server error" });
  }
});

//    Update blog code
// I can see some problem here lets see
blogRouter.put("/", async (c) => {
  const userId = c.get("userId");
  const prisma = new PrismaClient({
    datasourceUrl: c.env.DATABASE_URL,
  }).$extends(withAccelerate());
  const body = await c.req.json();
  const { success } = updatePost.safeParse(body);
  if (!success) {
    c.status(400);
    return c.json({ error: "invalid input" });
  }
  const updateBlog = await prisma.post.update({
    where: {
      id: body.id,
      authorId: userId,
    },
    data: {
      title: body.title,
      content: body.content,
    },
  });
  if (updateBlog) {
    return c.json({ messgae: "Blog post successfully updated" });
  } else {
    c.status(401);
    return c.json({
      error: "Blog does n't get updated",
    });
  }
});

//    Route to get all the blogs
blogRouter.get("/bulk", async (c) => {
  const prisma = new PrismaClient({
    datasourceUrl: c.env.DATABASE_URL,
  }).$extends(withAccelerate());
  const blogs = await prisma.post.findMany({
    select: {
      content: true,
      title: true,
      id: true,
      author: {
        select: {
          name: true,
        },
      },
    },
  });
  return c.json({
    blogs,
  });
});
//  Route to get all the blogs with specific id
blogRouter.get("/:id", async (c) => {
  const id = c.req.param("id");
  const prisma = new PrismaClient({
    datasourceUrl: c.env.DATABASE_URL,
  }).$extends(withAccelerate());
  const blog = await prisma.post.findUnique({
    where: {
      id,
    },
    select: {
      id: true,
      title: true,
      content: true,
      author: {
        select: {
          name: true,
        },
      },
    },
  });
  return c.json({ blog });
});

//   Delete blog route
blogRouter.delete("/:id/delete", async (c) => {
  const authorId = c.get("userId");
  const id = c.req.param("id");
  const prisma = new PrismaClient({
    datasourceUrl: c.env.DATABASE_URL,
  }).$extends(withAccelerate());
  //  Check if blog exisits
  try {
    const existingBlog = await prisma.post.findFirst({
      where: {
        id,
        authorId,
      },
    });
    if (!existingBlog) {
      console.log("Blog does not found");
      c.status(404);
      return c.json({
        error: "Blog does not found",
      });
    }
    //  Deleting the blog
    await prisma.post.delete({
      where: {
        id: existingBlog.id,
      },
    });
    await console.log("Blog deleted successfully");

    // Finalize the response
    c.status(200); // No content to return
    return c.json({ message: "Blog deleted successfully" });
  } catch (error) {
    console.error("Error deleting blog:", error);
    c.status(500);
    return c.json({ error: "Internal server error" });
  }
});
