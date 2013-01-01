package customcommands

import reactivemongo.core.commands._
import reactivemongo.bson._
import reactivemongo.bson.BSONInteger
import reactivemongo.bson.BSONString
import scala.Some

// { listDatabases: 1 }
/*
listDatabases returns a document for each database
Each document contains a name field with the database name,
a sizeOnDisk field with the total size of the database file on disk in bytes,
and an empty field specifying whether the database has any data.
 */
object ListDatabases extends AdminCommand[List[Database]] {

  object ResultMaker extends BSONCommandResultMaker[List[Database]] {
    def apply(doc: TraversableBSONDocument) = {
      CommandError.checkOk(doc, Some("listDatabases")).toLeft {
        doc.getAs[TraversableBSONArray]("databases").get.toList.map {
          case db: TraversableBSONDocument =>
            Database(
              db.getAs[BSONString]("name").get.value,
              db.getAs[BSONNumberLike]("sizeOnDisk").get.toLong,
              db.getAs[BSONBooleanLike]("empty").map(_.toBoolean).getOrElse(false)
            )
          case _ =>
            throw new RuntimeException("databases field is missing")
        }
      }
    }
  }

  def makeDocuments = BSONDocument("listDatabases" -> BSONInteger(1))
}

case class Database(
   name: String,
   sizeOnDisk: Long,
   empty: Boolean)

